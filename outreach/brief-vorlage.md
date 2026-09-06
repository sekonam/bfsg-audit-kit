# Briefvorlage — ENTWURF, VOR DEM ERSTEN EINSATZ VON EINEM MUTTERSPRACHLER PRÜFEN LASSEN

> ⚠️ **ENTWURF FÜR MENSCHLICHE PRÜFUNG.**
> Maschinell erstellt, sprachlich nicht abgenommen. **So nicht verschicken.**
>
> ⚠️ **Rahmen, der für diesen Brief gilt:**
>
> - Postversand ist zulässig und **braucht keine Einwilligung** — anders als Werbung per E-Mail,
>   die im geschäftlichen Verkehr in Deutschland ohne vorherige ausdrückliche Einwilligung
>   unzulässig ist (§ 7 Abs. 2 UWG, keine B2B-Ausnahme).
> - Der Brief nennt **ausschließlich technische Befunde**. Aussagen über Rechtsfolgen oder über
>   die Frage, ob der Shop „konform" sei, wären Rechtsdienstleistung (RDG) und sind hier nicht
>   zulässig.
> - Der Datenschutzhinweis nach Art. 14 DSGVO im Fußbereich ist **Pflicht**, nicht Zierde.
> - Ein Widerspruch wird sofort und dauerhaft beachtet.

---

## Platzhalter

| Platzhalter                | Bedeutung                                                                |
| -------------------------- | ------------------------------------------------------------------------ |
| `{{ANREDE}}`               | „Sehr geehrte Frau …" / „Sehr geehrter Herr …" — Name aus dem Impressum  |
| `{{SHOP}}`                 | Domain des Shops, z. B. `musterschuhe.de`                                |
| `{{BEFUND}}`               | **Ein** konkreter Befund, in Nutzerfolgen formuliert                     |
| `{{SEITE}}`                | Die Seite, auf der der Befund liegt („Ihre Kasse", „Ihre Produktseiten") |
| `{{BERICHT_URL}}`          | Adresse des Berichts, als Text und als QR-Code                           |
| `{{QUELLE}}` / `{{DATUM}}` | Herkunft und Datum der Adresserhebung (Art. 14 DSGVO)                    |
| `{{ABSENDER_*}}`           | Eigene Angaben                                                           |

---

## Brief

```text
{{ABSENDER_NAME}}
{{ABSENDER_STRASSE}}
{{ABSENDER_PLZ_ORT}}


{{EMPFAENGER_FIRMA}}
{{EMPFAENGER_NAME}}
{{EMPFAENGER_STRASSE}}
{{EMPFAENGER_PLZ_ORT}}

                                                            {{ORT}}, {{DATUM}}


Ein technischer Befund zu Ihrem Onlineshop {{SHOP}}


{{ANREDE}},

ich habe {{SHOP}} technisch geprüft — darauf, ob sich der Shop mit der Tastatur
und mit einem Screenreader bedienen lässt. Dabei ist mir ein Punkt aufgefallen,
den ich Ihnen nicht vorenthalten möchte:

    {{BEFUND}}

Praktisch heißt das: Wer {{SEITE}} ohne Maus oder mit einer Vorlesesoftware
benutzt, kommt an dieser Stelle nicht weiter. Die Bestellung bricht ab.

Den vollständigen Bericht habe ich bereits erstellt. Er ist auf Deutsch, führt
die Befunde nach Prüfkriterium auf, zeigt Bildschirmfotos der betroffenen
Stellen und schätzt den Aufwand für die Behebung. Sie können ihn hier abrufen:

    {{BERICHT_URL}}

                        [QR-Code]

Der Bericht ist kostenlos, unabhängig davon, ob wir zusammenarbeiten.

Zwei Sätze dazu, was ich mache und was nicht. Ich prüfe und behebe technische
Barrieren in Shopware- und Shopify-Themes — insbesondere den Teil, den
automatische Werkzeuge nicht abdecken: Fokusreihenfolge, sinnvolle
Bildbeschreibungen, Fehlermeldungen im Bestellprozess, Bedienung mit dem
Screenreader. Rund 57 Prozent der Prüfkriterien lassen sich automatisch
beurteilen; der Rest braucht einen Menschen.

Ich gebe keine rechtliche Einschätzung ab und darf das auch nicht. Was in
meinem Bericht steht, ist ausschließlich das technische Ergebnis der Prüfung
gegen die Erfolgskriterien der WCAG 2.1 Stufe AA bzw. der EN 301 549. Für
rechtliche Fragen wenden Sie sich bitte an eine Rechtsanwältin oder einen
Rechtsanwalt.

Wenn Sie den Bericht besprechen möchten, erreichen Sie mich unter
{{ABSENDER_TELEFON}}. Ein Anruf genügt; ich melde mich nicht von allein noch
einmal.

Mit freundlichen Grüßen


{{ABSENDER_NAME}}


--------------------------------------------------------------------------
Hinweis zum Datenschutz: Ihre geschäftlichen Kontaktdaten haben wir am
{{DATUM}} {{QUELLE}} entnommen. Wir verarbeiten Firmenname, Name, Anschrift
und Telefonnummer auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO, um Ihnen
einmalig dieses Angebot zu unterbreiten. Sie können der Verarbeitung
jederzeit ohne Angabe von Gründen widersprechen (Art. 21 DSGVO) — ein Anruf
an {{ABSENDER_TELEFON}} genügt; wir löschen Ihre Daten dann unverzüglich.
Ausführliche Informationen: {{ABSENDER_DATENSCHUTZ_URL}}
--------------------------------------------------------------------------
```

---

## Formulierungsbeispiele für `{{BEFUND}}`

Immer die **Folge für den Nutzer**, nie die Regelnummer:

| Befund                        | Formulierung                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label` auf der Kasse         | „Die Eingabefelder in Ihrem Bestellformular haben keine hinterlegte Beschriftung. Eine Vorlesesoftware sagt an dieser Stelle nur ‚Eingabefeld' an."                             |
| `button-name`                 | „Der Warenkorb-Knopf in Ihrer Kopfzeile trägt kein Textkennzeichen. Für eine Vorlesesoftware ist er nur eine ‚Schaltfläche' ohne Funktion."                                     |
| `image-alt` auf Produktseiten | „Ihre Produktbilder haben keine Bildbeschreibung. Blinde Kundinnen und Kunden erfahren nicht, welcher Artikel angezeigt wird."                                                  |
| `color-contrast`              | „Ihre Preisangaben und Hinweistexte haben einen Kontrast von {{WERT}}:1. Gefordert sind 4,5:1; unterhalb davon sind sie bei hellem Umgebungslicht auf dem Telefon kaum lesbar." |
| `meta-viewport`               | „Ihr Shop unterbindet auf dem Telefon das Vergrößern der Seite. Wer eine größere Schrift braucht, kann sie nicht einstellen."                                                   |

## Agentur-Variante

Für Shopware-/Shopify-Partneragenturen wird der Brief an zwei Stellen anders:

- **Betreff:** `Unterauftragnehmer für WCAG-Umsetzung in Shopware-/Shopify-Themes`
- **Statt des Befundabsatzes:**

```text
ich arbeite als Unterauftragnehmer für Agenturen an der WCAG-Umsetzung in
Shopware- und Shopify-Themes — dem Teil, den automatische Werkzeuge nicht
abdecken: Tastaturbedienung, Fokusreihenfolge, Screenreader-Prüfung,
Fehlerbehandlung im Bestellprozess.

Die Zusammenarbeit läuft unter Ihrem Namen: Ihr Kunde, Ihr Ansprechpartner,
meine Stunden. Der Bericht kommt unmarkiert, sodass Sie ihn unter Ihrem Logo
weitergeben können. Ein Shop kostet Sie 1.600 bis 2.900 Euro fest.

Wenn Sie einen Testfall haben, an dem sich das zeigen lässt, prüfe ich den
ersten Shop kostenlos und Sie sehen das Ergebnis, bevor Sie sich entscheiden.
```

**Nicht anschreiben:** die spezialisierten Barrierefreiheits-Agenturen aus
`barrierefreie-agenturen.de`. Das sind Wettbewerber, keine Kunden.

---

## Checkliste vor dem Versand

- [ ] Der Bericht unter `{{BERICHT_URL}}` ist erreichbar und der QR-Code führt tatsächlich dorthin
- [ ] `{{BEFUND}}` stammt aus **diesem** Shop und ist auf der genannten Seite nachvollziehbar
- [ ] Kein Satz über Rechtsfolgen, keine Zusicherung von Konformität
- [ ] Datenschutzhinweis vollständig, `{{QUELLE}}` und `{{DATUM}}` eingetragen
- [ ] Empfänger steht nicht auf der Sperrliste
- [ ] Der Shop ist im Anwendungsbereich (deutscher B2C-Shop, ≥ 10 Beschäftigte oder > 2 Mio. €)
- [ ] Muttersprachliche Korrektur des Textes ist erfolgt
