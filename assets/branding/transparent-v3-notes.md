# Sprint — transparent ribbon v3

The original ribbon artwork was generated with the built-in image tool; see `ribbon-v2-brief.md` for its prompts. The user explicitly authorized removing the background directly from the PNG after image generation produced irregular cutouts.

`remove-black-background.py` creates `sprint-logo-ribbon-transparent-v3.png` from the unchanged `sprint-logo-ribbon-v2.png`. It removes the black matte, recovers antialiasing, preserves the opaque interior pixel-for-pixel and discards isolated background pixels. This final cutout uses local Pillow/NumPy processing, not the image-generation CLI.

`assets/branding/app-icon.png` is the active transparent master. Native icons are packaged with `npm run tauri -- icon assets/branding/app-icon.png --ios-color '#000000'`. The Windows icons and web favicon retain transparency; iOS uses an opaque black background as required by that format.
