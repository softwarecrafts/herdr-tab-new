# A CLI with no server or database: dev, stop and seed are here for the project contract.
dev:
    @echo "herdr-tab-new has no dev server; use just test"

stop:
    @echo "nothing to stop"

seed:
    @echo "no database to seed"

test:
    bun test

# Typecheck, then tests.
check:
    bun run check
