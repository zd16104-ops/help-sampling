# Shared Worktree Coordination

- This project may be edited by several Codex tasks at the same time. Treat the files currently on disk as the source of truth.
- At the start of every task, run `git status --short` and read the latest version of every file you intend to modify.
- Re-read the relevant file immediately before applying a patch. Do not rely only on earlier conversation context, pasted snapshots, or previously read content.
- Preserve all existing staged, unstaged, and untracked work unless the user explicitly asks you to change it.
- If a target file changed since you last read it, merge your work into its current contents instead of overwriting or reverting the newer changes.
- Before committing, inspect `git diff` and stage only the files that belong to your task. Never use broad staging to absorb another task's work.
- Do not use destructive Git commands to resolve concurrent edits. Report genuine conflicts to the user.
