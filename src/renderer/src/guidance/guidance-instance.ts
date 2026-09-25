// guidance-instance.ts — the one GuidanceController for the main window, wired to
// the preload API. Shared so that Stop and project switches (App.tsx) cancel the
// same instance the Guidance screen drives.

import { GuidanceController, type PendingNotice } from './guidance-controller'

let noticeHandler: (pending: PendingNotice) => void = () => {}

/** The Guidance screen registers how to show the one-time capture notice. */
export function setGuidanceNoticeHandler(handler: (pending: PendingNotice) => void): void {
  noticeHandler = handler
}

export const guidanceController = new GuidanceController(
  {
    captureWindow: (sourceId, expectedName) => window.mybuildy.captureWindow(sourceId, expectedName),
    analyze: (capture, project, settings) => window.mybuildy.analyze(capture, project, settings as never),
    acceptCaptureNotice: () => window.mybuildy.acceptCaptureNotice(),
    activeProjectId: async () => (await window.mybuildy.projects.getActive())?.id ?? null,
  },
  (pending) => noticeHandler(pending),
)
