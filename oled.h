/*
 * SSD1306 128x64 I2C OLED driver (minimal, framebuffer-based).
 */

#ifndef OLED_H
#define OLED_H

#include "hal.h"

#define OLED_WIDTH              128U
#define OLED_HEIGHT             64U
#define OLED_PAGES              (OLED_HEIGHT / 8U)
#define OLED_FB_SIZE            (OLED_WIDTH * OLED_PAGES)

#define OLED_I2C_ADDR           0x3CU

#ifdef __cplusplus
extern "C" {
#endif

void oledInit(void);
void oledClear(void);
void oledFlush(void);
void oledSetPixel(uint16_t x, uint16_t y, bool on);
void oledDrawBitmap(uint16_t x, uint16_t y, uint16_t w, uint16_t h,
                    const uint8_t *bitmap);
void oledDrawChar(uint16_t x, uint16_t y, char c, uint8_t scale);
void oledDrawString(uint16_t x, uint16_t y, const char *str, uint8_t scale);
void oledDrawDigit16x24(uint16_t x, uint16_t y, uint8_t d);
uint16_t oledStrWidth(const char *str, uint8_t scale);
void oledUtoa(uint32_t v, char *buf, uint8_t digits);

extern const uint8_t oledLogo[];

#ifdef __cplusplus
}
#endif

#endif
