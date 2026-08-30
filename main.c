/*
 * Reflex Duel Game
 * Two players race to press their button when the Start LED lights.
 * Uses ChibiOS/RT SysTick for timing and the TRNG for random delays.
 */

#include "ch.h"
#include "hal.h"

#include "shell.h"
#include "chprintf.h"
#include "oled.h"

#include <stdbool.h>
#include <stdint.h>

#define LINE_START_LED          PAL_LINE(GPIOB, 6U)
#define LINE_WIN1_LED           PAL_LINE(GPIOC, 7U)
#define LINE_WIN2_LED           PAL_LINE(GPIOA, 6U)
#define LINE_BTN1               PAL_LINE(GPIOB, 10U)
#define LINE_BTN2               PAL_LINE(GPIOA, 7U)

#define WAIT_MIN_MS             3000U
#define WAIT_MAX_MS             8000U
#define RACE_TIMEOUT_MS         5000U
#define SUSPENSE_WINDOW_MS      300U
#define CLOSE_THRESHOLD_US      50000U
#define WIN_DISPLAY_MS          3000U
#define RESULT_HOLD_MS          1500U
#define ANIM_STEP_MS            100U
#define ANIM_CYCLES             3U

#define LOG_DEPTH               16U

#define EVENT_PRESS             ((eventmask_t)1 << 0)
#define EVENT_PAUSE             ((eventmask_t)1 << 1)

typedef enum {
  ST_WAIT,
  ST_RACE,
  ST_WIN,
  ST_ANIM
} game_state_t;

static event_source_t game_es;
static event_source_t pause_es;
static volatile game_state_t g_state = ST_WAIT;
static volatile uint8_t g_winner;
static volatile systime_t g_start_stamp;
static volatile uint32_t g_t1;
static volatile uint32_t g_t2;
static volatile bool g_paused;

static struct {
  uint8_t winner;
  uint32_t t1;
  uint32_t t2;
} g_log[LOG_DEPTH];
static uint32_t g_log_head;
static uint32_t g_log_count;
static uint32_t g_wins1;
static uint32_t g_wins2;

static const TRNGConfig trng_cfg = {
  0U
};

static void leds_off(void) {

  palClearLine(LINE_START_LED);
  palClearLine(LINE_WIN1_LED);
  palClearLine(LINE_WIN2_LED);
}

static void oled_center(uint16_t y, const char *str, uint8_t scale) {
  uint16_t w = oledStrWidth(str, scale);

  oledDrawString((OLED_WIDTH - w) / 2U, y, str, scale);
}

static void oled_draw_number(uint16_t x, uint16_t y, uint32_t v,
                             uint8_t digits) {
  char buf[10];
  uint8_t i;

  oledUtoa(v, buf, digits);

  for (i = 0; i < digits; i++) {
    oledDrawDigit16x24(x + (uint16_t)i * 18U, y,
                       (uint8_t)(buf[i] - '0'));
  }
}

static void render_splash(void) {

  oledClear();
  oledDrawBitmap((OLED_WIDTH - 32U) / 2U, 4U, 32U, 32U, oledLogo);
  oled_center(44U, "REFLEX DUEL", 2U);
  oledFlush();
}

static void render_wait(void) {

  oledClear();
  oled_center(16U, "GET READY", 2U);
  oled_center(40U, "P1", 1U);
  oled_center(50U, "P2", 1U);
  oledFlush();
}

static void render_race(void) {

  oledClear();
  oled_center(20U, "GO!", 3U);
  oledFlush();
}

static void render_pause(void) {

  oledClear();
  oled_center(24U, "PAUSED", 2U);
  oledFlush();
}

static void render_close(void) {

  oledClear();
  oled_center(24U, "CLOSE ONE!", 2U);
  oledFlush();
}

static void render_win(uint8_t winner, uint32_t t1, uint32_t t2) {
  uint32_t wtime;
  char buf[16];

  oledClear();

  if (winner == 1U) {
    oled_center(2U, "P1 WINS!", 2U);
    wtime = t1;
  }
  else {
    oled_center(2U, "P2 WINS!", 2U);
    wtime = t2;
  }

  oled_draw_number((OLED_WIDTH - 6U * 18U) / 2U, 30U, wtime, 6U);

  if (t1 != 0U) {
    oledUtoa(t1, buf, 6U);
    oledDrawString(0U, 56U, "P1:", 1U);
    oledDrawString(18U, 56U, buf, 1U);
  }
  else {
    oledDrawString(0U, 56U, "P1: none", 1U);
  }

  if (t2 != 0U) {
    oledUtoa(t2, buf, 6U);
    oledDrawString(64U, 56U, "P2:", 1U);
    oledDrawString(82U, 56U, buf, 1U);
  }
  else {
    oledDrawString(64U, 56U, "P2: none", 1U);
  }

  oledFlush();
}

static void btn_cb(void *arg) {
  uint8_t player = (uint8_t)(uintptr_t)arg;
  uint32_t us;

  chSysLockFromISR();

  if (g_paused) {
    chSysUnlockFromISR();
    return;
  }

  if (g_state == ST_RACE) {
    us = (uint32_t)TIME_I2US(chTimeDiffX(g_start_stamp,
                                         chVTGetSystemTimeX()));

    if (player == 1U) {
      if (g_t1 == 0U) {
        g_t1 = us;
      }
    }
    else {
      if (g_t2 == 0U) {
        g_t2 = us;
      }
    }

    if (g_winner == 0U) {
      g_winner = player;
    }

    chEvtBroadcastFlagsI(&game_es, EVENT_PRESS);
  }
  else if (g_state == ST_WAIT) {
    g_state = ST_WIN;
    chEvtBroadcastFlagsI(&game_es, EVENT_PRESS);
  }

  chSysUnlockFromISR();
}

static void log_winner(uint8_t winner, uint32_t t1, uint32_t t2) {
  syssts_t sts = chSysGetStatusAndLockX();

  uint32_t idx = (g_log_head + g_log_count) % LOG_DEPTH;
  g_log[idx].winner = winner;
  g_log[idx].t1 = t1;
  g_log[idx].t2 = t2;

  if (winner == 1U) {
    g_wins1++;
  }
  else {
    g_wins2++;
  }

  if (g_log_count < LOG_DEPTH) {
    g_log_count++;
  }
  else {
    g_log_head = (g_log_head + 1U) % LOG_DEPTH;
  }

  chSysRestoreStatusX(sts);
}

static uint32_t random_wait_ms(void) {
  uint32_t rnd = 0U;

  (void)trngGenerate(&TRNGD1, sizeof(rnd), (uint8_t *)&rnd);

  return WAIT_MIN_MS + (rnd % (WAIT_MAX_MS - WAIT_MIN_MS + 1U));
}

static void play_animation(void) {
  uint32_t i;

  for (i = 0; i < ANIM_CYCLES; i++) {
    palSetLine(LINE_START_LED);
    chThdSleepMilliseconds(ANIM_STEP_MS);
    palClearLine(LINE_START_LED);

    palSetLine(LINE_WIN1_LED);
    chThdSleepMilliseconds(ANIM_STEP_MS);
    palClearLine(LINE_WIN1_LED);

    palSetLine(LINE_WIN2_LED);
    chThdSleepMilliseconds(ANIM_STEP_MS);
    palClearLine(LINE_WIN2_LED);
  }
}

static void pause_blink(void) {

  render_pause();

  while (g_paused) {
    palSetLine(LINE_START_LED);
    palSetLine(LINE_WIN1_LED);
    palSetLine(LINE_WIN2_LED);
    chThdSleepMilliseconds(500U);
    leds_off();
    chThdSleepMilliseconds(500U);
  }

  leds_off();
}

static void cmd_log(BaseSequentialStream *chp, int argc, char *argv[]) {
  uint32_t i;
  uint32_t n;
  uint8_t winners[LOG_DEPTH];
  uint32_t t1s[LOG_DEPTH];
  uint32_t t2s[LOG_DEPTH];
  syssts_t sts;

  (void)argc;
  (void)argv;

  sts = chSysGetStatusAndLockX();
  n = g_log_count;
  for (i = 0; i < n; i++) {
    uint32_t idx = (g_log_head + i) % LOG_DEPTH;
    winners[i] = g_log[idx].winner;
    t1s[i] = g_log[idx].t1;
    t2s[i] = g_log[idx].t2;
  }
  chSysRestoreStatusX(sts);

  if (n == 0U) {
    chprintf(chp, "No winners yet.\r\n");
    return;
  }

  chprintf(chp, "  #  Winner   P1 [us]   P2 [us]\r\n");
  chprintf(chp, "----  ------  --------  --------\r\n");
  for (i = 0; i < n; i++) {
    chprintf(chp, "%4u  P%-4u  ", (unsigned)(i + 1U), (unsigned)winners[i]);
    if (t1s[i] == 0U) {
      chprintf(chp, "none      ");
    }
    else {
      chprintf(chp, "%-9u ", (unsigned)t1s[i]);
    }
    if (t2s[i] == 0U) {
      chprintf(chp, "none\r\n");
    }
    else {
      chprintf(chp, "%u\r\n", (unsigned)t2s[i]);
    }
  }
}

static void cmd_points(BaseSequentialStream *chp, int argc, char *argv[]) {
  uint32_t w1;
  uint32_t w2;
  syssts_t sts;

  (void)argc;
  (void)argv;

  sts = chSysGetStatusAndLockX();
  w1 = g_wins1;
  w2 = g_wins2;
  chSysRestoreStatusX(sts);

  chprintf(chp, "Player 1: %u win%s\r\n", (unsigned)w1,
           w1 == 1U ? "" : "s");
  chprintf(chp, "Player 2: %u win%s\r\n", (unsigned)w2,
           w2 == 1U ? "" : "s");
}

static void cmd_pause(BaseSequentialStream *chp, int argc, char *argv[]) {
  (void)argc;
  (void)argv;

  chSysLock();
  g_paused = !g_paused;
  chSysUnlock();

  if (g_paused) {
    chEvtBroadcastFlags(&pause_es, EVENT_PAUSE);
    chprintf(chp, "Game paused\r\n");
  }
  else {
    chprintf(chp, "Game resumed\r\n");
  }
}

static const ShellCommand commands[] = {
  {"log", cmd_log},
  {"points", cmd_points},
  {"pause", cmd_pause},
  {NULL, NULL}
};

static const ShellConfig shell_cfg = {
  (BaseSequentialStream *)&SD2,
  commands
};

#define WA_SHELL                2048U
THD_WORKING_AREA(waShell, WA_SHELL);

int main(void) {
  event_listener_t el;
  event_listener_t el_pause;

  halInit();
  chSysInit();

  chEvtObjectInit(&game_es);
  chEvtObjectInit(&pause_es);

  palSetPadMode(GPIOA, 2U, PAL_MODE_ALTERNATE(7U));
  palSetPadMode(GPIOA, 3U, PAL_MODE_ALTERNATE(7U));
  sdStart(&SD2, NULL);

  palSetLineMode(LINE_START_LED, PAL_MODE_OUTPUT_PUSHPULL);
  palSetLineMode(LINE_WIN1_LED, PAL_MODE_OUTPUT_PUSHPULL);
  palSetLineMode(LINE_WIN2_LED, PAL_MODE_OUTPUT_PUSHPULL);
  palSetLineMode(LINE_BTN1, PAL_MODE_INPUT_PULLUP);
  palSetLineMode(LINE_BTN2, PAL_MODE_INPUT_PULLUP);

  palSetLineCallback(LINE_BTN1, btn_cb, (void *)1U);
  palSetLineCallback(LINE_BTN2, btn_cb, (void *)2U);
  palEnableLineEvent(LINE_BTN1, PAL_EVENT_MODE_FALLING_EDGE);
  palEnableLineEvent(LINE_BTN2, PAL_EVENT_MODE_FALLING_EDGE);

  trngStart(&TRNGD1, &trng_cfg);

  oledInit();
  render_splash();

  shellInit();
  chEvtRegisterMask(&game_es, &el, EVENT_PRESS);
  chEvtRegisterMask(&pause_es, &el_pause, EVENT_PAUSE);

  chThdCreateStatic(waShell, sizeof(waShell), NORMALPRIO, shellThread,
                    (void *)&shell_cfg);

  while (true) {
    eventmask_t ev;

    if (g_paused) {
      (void)chEvtWaitAnyTimeout(EVENT_PAUSE, TIME_IMMEDIATE);
      pause_blink();
      continue;
    }

    play_animation();

    g_state = ST_WAIT;
    g_winner = 0U;
    g_t1 = 0U;
    g_t2 = 0U;
    leds_off();
    render_wait();

    ev = chEvtWaitAnyTimeout(EVENT_PRESS | EVENT_PAUSE,
                             TIME_MS2I(random_wait_ms()));
    if ((ev & EVENT_PAUSE) != 0U) {
      pause_blink();
      continue;
    }
    if (ev != 0U) {
      continue;
    }

    chSysLock();
    g_state = ST_RACE;
    g_start_stamp = chVTGetSystemTimeX();
    chSysUnlock();
    palSetLine(LINE_START_LED);
    render_race();

    ev = chEvtWaitAnyTimeout(EVENT_PRESS | EVENT_PAUSE,
                             TIME_MS2I(RACE_TIMEOUT_MS));
    palClearLine(LINE_START_LED);

    if (ev == 0U) {
      continue;
    }

    if ((ev & EVENT_PAUSE) != 0U) {
      pause_blink();
      continue;
    }

    ev = chEvtWaitAnyTimeout(EVENT_PRESS | EVENT_PAUSE,
                             TIME_MS2I(SUSPENSE_WINDOW_MS));
    if ((ev & EVENT_PAUSE) != 0U) {
      pause_blink();
      continue;
    }

    g_state = ST_WIN;

    {
      uint8_t winner = g_winner;
      uint32_t t1 = g_t1;
      uint32_t t2 = g_t2;

      log_winner(winner, t1, t2);

      if (t1 != 0U && t2 != 0U) {
        uint32_t diff = (t1 > t2) ? (t1 - t2) : (t2 - t1);

        if (diff <= CLOSE_THRESHOLD_US) {
          render_close();
          play_animation();
        }
      }

      render_win(winner, t1, t2);

      palSetLine(winner == 1U ? LINE_WIN1_LED : LINE_WIN2_LED);
      chThdSleepMilliseconds(WIN_DISPLAY_MS);
      leds_off();
    }
  }
}
