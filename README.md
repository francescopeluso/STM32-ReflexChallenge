# STM32-ReflexChallenge

Reflex-based two-player reaction game on the STM32G474RE Nucleo board, built
with ChibiOS/RT — with an OLED scoreboard, serial shell, and a web dashboard
for stats.

Two players wait for a Start LED, then race to press their button. The first
press wins; reaction times are measured in microseconds, logged over the serial
shell, and shown live in a web dashboard.

## Features

- Two-player reflex duel with false-start detection and continuous rounds
- Random 3–8 s delay per round (hardware TRNG, so it can't be predicted)
- Reaction timing via the RT system tick (SysTick)
- Close-call animation when both players press within 50 ms of each other
- SSD1306 128×64 I2C OLED scoreboard (splash, game states, large-digit times)
- ChibiOS shell: `log` (round table), `points` (score), `pause`
- Next.js + Tailwind dashboard with live stats over Web Serial

## Hardware

STM32G474RE Nucleo-64, external breadboard components:

| Signal            | GPIO | Arduino |
|-------------------|------|---------|
| Start LED (Red)   | PB6  | D10     |
| Winner 1 (Blue)   | PC7  | D9      |
| Winner 2 (Green)  | PA6  | D12     |
| Player 1 button   | PB10 | D6      |
| Player 2 button   | PA7  | D11     |
| OLED SCL (I2C1)   | PB8  | D15     |
| OLED SDA (I2C1)   | PB9  | D14     |

- LEDs: active-high, series resistor to GND.
- Buttons: switch to GND, internal pull-up.
- OLED: SSD1306 128×64 I2C, address `0x3C`, 3.3 V.
- Serial: ST-Link VCP, 38400 baud.

## Firmware

Built with ChibiOS/RT 21.11.x (`chibios2111/` next to the workspace).

```sh
make -j          # build
make clean       # clean
```

Flash with Eclipse (OpenOCD launch configs in `debug/`) or:

```sh
openocd -f board/st_nucleo_g4.cfg \
  -c "program build/ch.elf verify reset exit"
```

### Shell

Connect a terminal at 38400 baud, prompt `reflex> `:

- `log` — table of recent rounds: `# | Winner | P1 [us] | P2 [us]`
- `points` — cumulative wins per player
- `pause` — pause/resume; all LEDs blink together at 1 s while paused

## Dashboard

A Next.js + Tailwind app in `dashboard/` that talks to the board over the
browser Web Serial API (Chrome/Edge).

```sh
cd dashboard
npm install
npm run dev
```

Open `http://localhost:3000`, click *Connect board*, and select the ST-Link
serial port. It polls the shell and shows wins, win rates, close calls,
reaction-time stats, and the recent-rounds table.

## Project structure

```
├── main.c          game logic + shell commands
├── oled.c/.h       SSD1306 I2C driver, fonts, logo
├── shellconf.h     shell prompt + command flags
├── cfg/            chconf.h, halconf.h, mcuconf.h
├── debug/          Eclipse OpenOCD launch configs
├── SPEC.md         full specification
└── dashboard/      Next.js + Tailwind web app
```
