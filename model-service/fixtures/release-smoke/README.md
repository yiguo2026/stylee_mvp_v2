# Release smoke fixtures

These are reduced, project-owned fixtures for the authenticated production
release gate. They are not user uploads or private images.

- `garment.png` is a 384×384 derivative of the Stylee App asset
  `public/preset-items/a-line-skirt.png`.
- `person.jpg` is a 448×600 derivative of the Stylee App asset
  `assets/tryon/office.png`.

Only resizing and JPEG encoding were applied. The compact copies keep CI and
authenticated smoke request bodies small while exercising the real visual
provider paths.
