# Deployment Contract

The app repository must publish release metadata that the infra repository can validate.

## Required release metadata

- application name
- image repository
- immutable image digest
- source commit SHA
- workflow identity
- expected base path
- exposed container port
- health or smoke-check endpoint

## Rule

`home-lab` promotion logic must verify this contract before production promotion.
