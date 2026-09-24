// quit.spec.ts — a plain app.quit() (what macOS Cmd+Q, the app menu's Quit and
// Dock > Quit all call) must really exit the process. The hidden Settings
// window hides-instead-of-closing unless a quit is in progress; if that ever
// regresses, the quit is silently cancelled and the app keeps running.

import { test, expect } from '@playwright/test'
import { launchMyBuildy, type MyBuildyApp } from './helpers'

let mybuildy: MyBuildyApp

test.beforeAll(async () => {
  mybuildy = await launchMyBuildy()
})

test.afterAll(async () => {
  await mybuildy?.close() // time-boxed; also verifies the real profile is untouched
})

test('app.quit() exits the app (Cmd+Q / Dock Quit path)', async () => {
  const exited = new Promise<void>((resolve) => mybuildy.app.process().once('exit', () => resolve()))
  await mybuildy.app.evaluate(({ app }) => {
    setTimeout(() => app.quit(), 50)
  })
  const outcome = await Promise.race([
    exited.then(() => 'exited'),
    new Promise<string>((resolve) => setTimeout(() => resolve('still running after 10s'), 10_000)),
  ])
  expect(outcome).toBe('exited')
})
