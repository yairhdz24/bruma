fn main() {
    println!("cargo:rerun-if-changed=native/symbols.m");
    println!("cargo:rerun-if-changed=native/context.m");
    println!("cargo:rerun-if-changed=native/permissions.m");
    println!("cargo:rerun-if-changed=native/paste.m");
    println!("cargo:rerun-if-changed=native/keys.m");
    println!("cargo:rerun-if-changed=native/focus.m");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("native/symbols.m")
            .file("native/context.m")
            .file("native/permissions.m")
            .file("native/paste.m")
            .file("native/keys.m")
            .file("native/focus.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .compile("bruma_system_symbols");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=AVFoundation");
        println!("cargo:rustc-link-lib=framework=ApplicationServices");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
        println!("cargo:rustc-link-lib=objc");
    }
    tauri_build::build();
}
