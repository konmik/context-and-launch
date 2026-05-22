# AI Stages — Glossary

## Project

A reference to a local git repository on disk that ai-stages manages. Defined by its filesystem path. The display name and URL slug are derived from the directory name. If multiple projects share a directory name, the slug is extended with parent directory segments. The user can edit the slug.

## Project Registry

A JSON config file at `~/.ai-stages/config.json` that stores the list of registered projects and the last-used project slug. Lives outside any project repo.

## Slug

A short URL-friendly identifier for a project, derived from its directory name (e.g. `my-repo`). Used in URLs like `/project/my-repo`. Editable by the user. Must be unique across the registry.
