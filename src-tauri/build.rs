fn main() {
    // Regenerate native icon resources whenever the branding assets change.
    println!("cargo:rerun-if-changed=icons");
    // Track the frontend directory too, including assets added by a new Vite build.
    println!("cargo:rerun-if-changed=../dist");
    tauri_build::build();
}
