# Fixture images

Three tiny synthetic PNGs (a coloured shape on a light card), referenced by the fixture shop's
product and teaser markup. Not photographs, not copied from anywhere.

They exist because the element screenshots the report embeds are only worth checking if there is
something to photograph. Before these files existed the fixture referenced images that 404'd, so
every screenshot of an `image-alt` finding was a picture of a broken-image icon — the assertion
"the embedded screenshots resolve" passed while the report showed a customer an empty box.

Regenerate with `node --experimental-strip-types scripts/make-fixture-images.ts`. Output is
deterministic, so re-running it produces byte-identical files and no spurious diff.
