# Velvet v44 RC hardening

Scope:
- wire image fallback guard into production shell
- wire Session swipe cues into production shell
- pin v44 module cache keys
- add CI regression checks for swipe semantics, PWA icons, and required production modules

Release gate:
- merge to main
- Velvet static QA succeeds
- production deployment READY
- production HTML contains v44 + image-guard + session-cues
- manifest and icon URLs return 200
