# Contributing to Antigravity Scribe

## Development Setup

1.  **Clone & Install:**
    ```bash
    git clone https://github.com/sciscend/antigravity-scribe.git
    cd antigravity-scribe
    npm install
    ```


2. **Building from Source**

```bash
npm install
npm run bundle
npm run package
```
This produces a `.vsix` file in the root directory.

3.  **Run in Development Mode:**
    *   Open the project in VS Code or Antigravity.
    *   Press `F5` to launch the **Extension Development Host**.
    *   The extension will reload automatically when you save changes if `npm run watch` is running.

4.  **Code Quality:**
    We use ESLint and Prettier. Please run the linter before submitting a PR:
    ```bash
    npm run lint
    ```

## Submitting Changes

1.  Fork the repo and create a new branch.
2.  Make your changes and ensure they are lint-free.
3.  Submit a Pull Request with a clear description of what you've changed.

All contributions are welcome!
