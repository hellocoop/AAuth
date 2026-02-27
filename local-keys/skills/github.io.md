# Skill: Set up AAuth keys for GitHub Pages

## When to use

The user wants to set up AAuth agent keys published via GitHub Pages (username.github.io).

## Prerequisites

- `@aauth/local-keys` is installed
- `gh` CLI is authenticated

## Steps

1. **Determine the agent URL.** Ask the user for their GitHub Pages URL if not obvious. It will be `https://username.github.io`.

2. **Generate a key pair.** Run:
   ```
   npx @aauth/local-keys <agent-url>
   ```
   This stores the private key in the OS keychain and prints the public JWK.

3. **Locate or create the GitHub Pages repo.**
   - Look for `username.github.io` cloned locally.
   - If not cloned, clone it with `git clone https://github.com/username/username.github.io.git`.
   - If the repo doesn't exist on GitHub, create it with `gh repo create username.github.io --public` then clone it.

4. **Ensure `.nojekyll` exists.** GitHub Pages uses Jekyll by default, which ignores dotfiles like `.well-known/`. Create an empty `.nojekyll` file in the repo root if it doesn't already exist.

5. **Create or update `.well-known/jwks.json`.** In the GitHub Pages repo:
   - If `.well-known/jwks.json` exists, read it and parse the `keys` array.
   - If it doesn't exist, create the `.well-known/` directory and start with `{ "keys": [] }`.
   - Add the public JWK (from step 2 output) to the `keys` array.
   - Write the file with `JSON.stringify(jwks, null, 2)`.

5. **Verify the JWKS file.** Ensure it is valid JSON with a `keys` array, and each key has `kty`, `crv`, `x`, `kid`, `use`, `alg`.

6. **Commit and push.** Commit the changes to the GitHub Pages repo and push so the JWKS is published at `https://username.github.io/.well-known/jwks.json`.

7. **Verify publication.** After push, confirm the JWKS is accessible at the public URL. GitHub Pages may take a minute to update.

## Example JWKS file

```json
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "...",
      "kid": "2026-02-27_a3f",
      "use": "sig",
      "alg": "EdDSA"
    }
  ]
}
```

## Notes

- Each `npx @aauth/local-keys <agent-url>` call generates a new key and sets it as current. Old keys remain in the keychain and should remain in the JWKS for verification of previously issued tokens.
- The JWKS file contains only public keys — it is safe to commit.
- Run `npx @aauth/local-keys` (no args) to see all stored keys.
