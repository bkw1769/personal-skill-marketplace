# Agent Instructions
Treat this project as a mono-repo.
See `docs/MEMORY.md` for quick reference lookup, `docs/DECISIONS.md` for rationale, and `docs/STRUCTURE.md` for project structure.

## Response Contract
### Contract #1
User facing responses and outputs must always be in Korean language.
Codes, comments, documentations, and other internal materials can be in any language; default to English.

### Contract #2
When any skill, MCP server, connector, or plugin is used in a response,
start the FINAL response (not every snippets) with:
```
[USED: skill:<name>(files: <path1>, <path2>, ...), mcp:<name>, ...]
```
One line. Include specific reference files read. Omit unused categories.

## Project Structure
- Documentations are stored under `/docs` (see the Documentation section below).
- For each sub-repo (API, Client, App, DB, etc.) create a folder at the project root and use it accordingly.

## Documentation
- Use `/docs/DECISIONS.md` for durable behavior/contract decisions ledger; create if non-existent.
- Use `/docs/MEMORY.md` for quick & terse lookup/caveats; create if non-existent.
- Use `/docs/STRUCTURE.md` for keeping track of project structure and specific file and directory definition and purpose; create if non-existent.
- Keep DECISIONS durable and behavior-focused. Keep MEMORY terse and searchable. Keep STRUCTURE up-to-date.
- Keep README.md files in project root and each sub-repo; README.md file in project root should be a short summary of the entire project and run instructions for the entire mono-repo stack; README.md files in each sub-repo should be a short summary of the sub-repo and run instructions.
- When behavior, contracts, schemas, or workflows change, update relevant docs in the same pass.

## Skills
When a task matches an available skill, invoke it. Check the full skill list — don't skip a relevant skill because it wasn't explicitly requested. Follow all referenced files within a skill, not just the top-level entry.

## Testing
Each sub-repo should have its own testing suite; project root should have a single testing suite that runs all sub-repos tests in an orderly fashion.
Each test suite must be an unit test and must exhaustively cover all code paths. 100% code coverage is required.
Tests should NEVER be engineered to always succeed or manufactured to falsely act like there are no errors.

## Conventions
- **Type every public signature.** Every public function, method, and exported symbol declares its parameter and return types. The syntax is per-language; see the table below.
- **No emojis** in code, comments, or committed docs unless the user asks.
- **Tests in the same pass as the code change.** No landing new behavior without tests.

### Per-language conventions
Naming case rules and type annotation syntax depend on the language, and are decided when each sub-repo's stack is fixed. Leave a row as TBD until that stack is actually chosen. Do not guess: a convention nobody follows is worse than no convention.

| Sub-repo | Language | Naming | Type annotation |
|---|---|---|---|
| _None confirmed_ | TBD | TBD | TBD |
