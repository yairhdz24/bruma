#import <AppKit/AppKit.h>
#include <limits.h>
#include <stdio.h>
#include <unistd.h>

extern int bruma_microphone_status(void);
extern int bruma_accessibility_status(int prompt);
extern char *bruma_app_icon_png(int pid, const char *expected_bundle);
extern void bruma_free_symbol_data(char *data);

int main(void) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        // Read-only queries: these tests must never request a permission or start capture.
        int microphone = bruma_microphone_status();
        if (microphone < 0 || microphone > 3) {
            fprintf(stderr, "Microphone permission query returned an invalid status.\n");
            return 1;
        }
        int accessibility = bruma_accessibility_status(0);
        if (accessibility != 0 && accessibility != 1) {
            fprintf(stderr, "Accessibility permission query returned an invalid status.\n");
            return 1;
        }
        char *unknown = bruma_app_icon_png(INT_MAX, "com.bruma.unknown-process");
        if (unknown != NULL) {
            bruma_free_symbol_data(unknown);
            fprintf(stderr, "An unknown process unexpectedly returned an app icon.\n");
            return 1;
        }
        char *mismatch = bruma_app_icon_png((int)getpid(), "com.bruma.intentional-bundle-mismatch");
        if (mismatch != NULL) {
            bruma_free_symbol_data(mismatch);
            fprintf(stderr, "A mismatched process bundle unexpectedly returned an app icon.\n");
            return 1;
        }
        puts("Native context/privacy: valid read-only permission states; unknown PID and mismatched bundle rejected.");
        return 0;
    }
}
