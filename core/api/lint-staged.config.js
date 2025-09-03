module.exports = {
  '**/*.{ts,js}': (filenames) => [
    `pnpm eslint-fix ${filenames.join(' ')}`,
    `pnpm tsc-check ${filenames.join(' ')}`,
  ],
}
