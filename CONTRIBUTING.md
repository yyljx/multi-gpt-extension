# Contributing to Multi-GPT Extension

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## How to Contribute

### Reporting Bugs

1. Check if the issue already exists in the [Issues](../../issues) section
2. If not, create a new issue with:
   - Clear title describing the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Browser version and OS

### Suggesting Features

1. Open an issue with the `enhancement` label
2. Describe the feature and its use case
3. Explain why it would be useful

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Test your changes thoroughly
5. Commit with clear messages: `git commit -m "Add: description of change"`
6. Push to your fork: `git push origin feature/your-feature-name`
7. Open a Pull Request

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project folder

## Code Style

- Use meaningful variable and function names
- Add comments for complex logic
- Follow existing code patterns in the project
- Test on multiple platforms before submitting

## Adding New Platform Support

To add support for a new AI platform:

1. Create a new file in `platforms/` (e.g., `newplatform.js`)
2. Follow the existing pattern with `SELECTORS`, `inputAndSend()`, etc.
3. Add the platform to `manifest.json` content scripts
4. Update `popup/popup.js` with the new platform
5. Test thoroughly before submitting

## Questions?

Feel free to open an issue for any questions about contributing.
