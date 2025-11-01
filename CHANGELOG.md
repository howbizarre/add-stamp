# Changelog

## [Unreleased] - 2025-11-01

### Fixed
- **Firefox Compatibility**: Resolved issue where Firefox would open individual download dialogs for each processed image when saving to disk
  - Added JSZip library to create a single ZIP archive containing all stamped images
  - Chrome and other browsers supporting File System Access API continue to use the native directory picker
  - Firefox and other browsers without File System Access API support now download a single ZIP file instead of triggering multiple download dialogs

### Changed
- Modified `downloadStampedImages` method in `useImageStamping.ts` to create ZIP archives instead of individual file downloads
- ZIP files are named with timestamp: `stamped-images-{timestamp}.zip`
- All images are organized in a `stamped-images` folder within the ZIP archive

### Technical Details
- The application now detects browser support for File System Access API
- **Chrome/Edge**: Uses native directory picker with `showDirectoryPicker()` API
- **Firefox/Safari**: Falls back to ZIP download method
- ZIP compression level set to 6 (balanced between speed and file size)
