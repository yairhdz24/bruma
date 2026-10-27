#import <AppKit/AppKit.h>
#include <stdio.h>
#include <string.h>

extern char *bruma_system_symbol_png(const char *symbol_name);
extern void bruma_free_symbol_data(char *data);

int main(void) {
    @autoreleasepool {
        // Initialize AppKit on the main thread without opening a window or event loop.
        [NSApplication sharedApplication];
        const char *names[] = {"mic.fill", "gearshape", "globe"};
        for (NSUInteger i = 0; i < sizeof(names) / sizeof(names[0]); i++) {
            char *encoded = bruma_system_symbol_png(names[i]);
            if (encoded == NULL) {
                fprintf(stderr, "SF Symbol did not render: %s\n", names[i]);
                return 1;
            }
            NSString *base64 = [NSString stringWithUTF8String:encoded];
            bruma_free_symbol_data(encoded);
            NSData *png = base64 == nil ? nil : [[NSData alloc] initWithBase64EncodedString:base64 options:0];
            const unsigned char signature[] = {137, 80, 78, 71, 13, 10, 26, 10};
            if (png.length < sizeof(signature) || memcmp(png.bytes, signature, sizeof(signature)) != 0) {
                fprintf(stderr, "SF Symbol returned malformed PNG data: %s\n", names[i]);
                return 1;
            }
            NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithData:png];
            if (bitmap == nil || bitmap.pixelsWide != 64 || bitmap.pixelsHigh != 64 || !bitmap.hasAlpha) {
                fprintf(stderr, "SF Symbol is not a 64x64 PNG with alpha: %s\n", names[i]);
                return 1;
            }
            BOOL visible = NO;
            for (NSInteger y = 0; y < 64 && !visible; y++) {
                for (NSInteger x = 0; x < 64; x++) {
                    if ([bitmap colorAtX:x y:y].alphaComponent > 0.01) { visible = YES; break; }
                }
            }
            if (!visible) {
                fprintf(stderr, "SF Symbol rendered an empty image: %s\n", names[i]);
                return 1;
            }
        }
        char *unsupported = bruma_system_symbol_png("bruma.symbol.that.does.not.exist");
        if (unsupported != NULL) {
            bruma_free_symbol_data(unsupported);
            fprintf(stderr, "An unsupported SF Symbol unexpectedly produced an image.\n");
            return 1;
        }
        puts("SF Symbols: three valid 64x64 images with visible alpha; unsupported name rejected.");
        return 0;
    }
}
