# Git hooks

## Prevent `cursoragent` on GitHub contributors

Cursor can add `Co-authored-by: Cursor <cursoragent@cursor.com>` to commits, which makes [cursoragent](https://github.com/cursoragent) show up as a contributor.

Run once after cloning:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/prepare-commit-msg
```

The `prepare-commit-msg` hook removes Cursor co-author and `Made-with: Cursor` lines before the commit is created.

Also turn off **Cursor Settings → Agents → Attribution** (Commit and PR attribution).
