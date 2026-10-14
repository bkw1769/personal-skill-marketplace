# <story title> · character bible

Style: <style slug> · Era: <era slug> · Audience: <age> · Version: v<N> · Updated: <date>

Paper: <hex, default #f4efe2> — the one paper tone named in every kit, cut-out and plate prompt, and passed to `sheet-to-sprites` as `--rim` so every cut piece and character has the same paper margin.

Identity sentences are pasted verbatim into every prompt. Edit here first, never inside a prompt.

## Characters

### <Korean caption, e.g. 그레텔>
- Role: <protagonist / helper / antagonist>, <age>
- Silhouette: <tall-thin / short-round / ...>
- Signature colors: <color 1>, <color 2> (not used as main colors by anyone else)
- Signature accessory: <one item>
- Identity sentence:

```text
<one paragraph: age and role, silhouette, face, hair, outfit with named colors, accessory, personality in a pose>
```

<repeat per character>

## Key props and locations

### <prop caption>
```text
<shape sentence: overall form, materials, 3-4 distinctive features, colors>
```

## Element kit (backgrounds, mandatory)

Every background element is a separate torn-paper piece (see `references/element-kits.md`). One line per piece: kebab-case name, layer, sentence. Scenes are pasted together from these names.

| Name | Layer | Element sentence |
|---|---|---|
| <cottage-hero> | mid | <thatched-roof cottage with ...> |

Kit sheets: <kit key>: <names in slot order>, scale ref <piece = character height>.

## Change log
- v1 <date>: initial designs.
