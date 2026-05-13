/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^electron$': '<rootDir>/test/mocks/electron.cjs',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@main/(.*)$': '<rootDir>/src/main/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
    '^.+\\.md$': '<rootDir>/jest-md-transform.cjs',
  },
};
