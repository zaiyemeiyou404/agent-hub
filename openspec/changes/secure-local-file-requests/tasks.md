# Tasks

- [x] Inspect existing node commands, approvals, file storage, connector, notifications, and identity model.
- [x] Define mandatory requester and recipient Agent/device identity snapshot.
- [x] Define fail-closed path, classification, approval, integrity, and capability contract.
- [x] Add failing backend tests for authentication, authorization, identity snapshots, forced approval, upload integrity, expiry, and privacy.
- [x] Implement backend model, migration, typed service/endpoints, forced approval, and notification integration.
- [x] Add failing connector tests for roots, traversal, symlinks, sensitivity, recipient binding, expiry, and hash binding.
- [x] Implement connector prepare/release/upload and capability declaration.
- [x] Add approval/request status UI support with English and Chinese copy.
- [x] Run targeted tests and confirm RED then GREEN.
- [x] Run affected backend and connector suites, frontend tests/typecheck/build, and security review. Remaining failures were reproduced on the fixed baseline and are unrelated to this change.
- [x] Deploy the feature branch and run the live protocol smoke.
- [x] Commit and push only `feat/secure-local-file-requests`.
