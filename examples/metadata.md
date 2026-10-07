{{nyml
kind: document
carrier: md
uid: doc-jwn73zjgtdzuug7s
title: Portable Metadata Example
author: Example Author
description: A minimal mdhtml document with portable authorship and license metadata.
date: 2026-07-11
keywords: mdhtml, metadata, editable document
source: https://markdown.orz.how/
license: CC-BY-4.0
license_name: Creative Commons Attribution 4.0
license_url: https://creativecommons.org/licenses/by/4.0/
}}

# Portable Metadata Example

The header above is the document's metadata (orz text format 1): title,
author, description, date, keywords, source and licence. `orz-mdhtml
assemble` writes it into the file's `<head>` and its `#orz-meta` JSON island,
and every save in the browser writes it again from the text — so it survives
edits, saves and updates.

::: info
This text was made from the 0.8 example with `orz-mdhtml upgrade`, which moved
the file's `#orz-meta` record into the header. Its `.md.html` carries the
engine inline (the default).
:::
