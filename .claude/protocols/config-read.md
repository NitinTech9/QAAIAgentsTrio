# Protocol: reading project configuration (canonical)

1. Read `.claude/project-config.json`. Then read `.claude/project-config.local.json` if it
   exists and **merge it over** the base config — local values take precedence. Local is how
   developers set machine-specific values (e.g. `productCode.rootPaths`); it is git-ignored.
2. `{config.paths.X}` anywhere in a command/agent/skill means the value of `project.paths.X`
   after that merge; likewise `config.app.*`, `config.auth.*`, `config.testFramework`, etc.
3. Never hardcode paths, URLs, Jira/tracker settings, or auth details that the config defines —
   if a value you need has no config key, say so rather than inventing a literal.
4. Framework-specific syntax and conventions come from
   `.claude/templates/{config.testFramework}-javascript.md` — read it before generating or
   validating specs.
