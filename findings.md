# Findings

- The target app is `packages/web` (`@agent-spaces/web`), a Next.js 16 React 19 app.
- Tailwind CSS v4 and `tw-animate-css` are already configured in `src/app/globals.css`.
- `packages/web/components.json` uses shadcn `base-nova`, neutral CSS variables, and Lucide icons.
- The app has many local UI components under `src/components/ui`; `button.tsx` still wraps `@radix-ui/react-slot`, while `card.tsx` already uses newer shadcn data-slot conventions.
- Existing CSS already defines Coss-documented extra semantic tokens (`info`, `success`, `warning`, and foreground variants), but font variables are app-specific aliases rather than Coss font packages.
- `@base-ui/react` is already a direct dependency, which reduces risk for Coss primitives.
- Direct npm lookup for `@coss/ui`, `@coss/style`, and `@coss/fonts` returns 404; the supplied guide's supported path is shadcn registry commands (`add @coss/ui` / `add @coss/style`), not npm install.
- `https://coss.com/ui/r/registry.json` is reachable but contains metadata without `files[].content`; source must be fetched per component URL.
- `shadcn add` against both `@coss/ui` and a direct component URL stalls during registry/dependency handling in this environment. A metadata-only extraction cannot safely replace local files.
- The official GitHub tree contains complete source files under `ui/`, `base-ui/`, `lib/`, and `hooks/`; these are suitable for deterministic local downloads.
- Coss `calendar.tsx` requires `@daypicker/react`; Coss `otp-field.tsx` requires a newer Base UI export (`OTPField`) than the installed `@base-ui/react@1.4.1`.
