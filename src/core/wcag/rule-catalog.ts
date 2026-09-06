import type { Severity } from '../types.ts';

/**
 * German copy for the engine rules that actually fire on German online shops.
 *
 * Why a hand-written catalogue rather than translating axe's own help text:
 * the report goes to a merchant, not to a developer. It has to say what is
 * broken, what the shopper experiences, and what a theme developer changes —
 * in German, without WCAG jargon and without any statement about legal
 * consequences (RDG boundary, see docs/PRODUCT-SPEC.md).
 *
 * Rules not listed here still make it into the report: `normalizeAxe` falls
 * back to the engine's own English help text and marks the entry as
 * untranslated, so coverage gaps are visible instead of silent.
 */
export interface RuleCopy {
  readonly titleDe: string;
  readonly descriptionDe: string;
  readonly remediationDe: string;
  /**
   * Repeatable theme edit (codemod candidate) rather than a judgement call.
   * Drives the effort estimate and the prospect score.
   */
  readonly mechanicallyFixable: boolean;
  /** Overrides the engine's impact when it is systematically misleading. */
  readonly severity?: Severity;
  /** Overrides the criteria derived from the engine tags. */
  readonly criteria?: readonly string[];
}

export const RULE_COPY: Readonly<Record<string, RuleCopy>> = {
  'area-alt': {
    titleDe: 'Image-Map-Bereiche ohne Alternativtext',
    descriptionDe:
      'Anklickbare Bereiche einer Bildkarte haben keinen Alternativtext. Screenreader kündigen sie nur als „Link“ an.',
    remediationDe: 'Jedem <area>-Element ein aussagekräftiges alt-Attribut geben.',
    mechanicallyFixable: false,
  },
  'aria-allowed-attr': {
    titleDe: 'Unzulässige ARIA-Attribute',
    descriptionDe:
      'Ein Element trägt ARIA-Attribute, die für seine Rolle nicht erlaubt sind. Hilfstechnologien werten das Element dadurch falsch aus.',
    remediationDe:
      'Die unzulässigen aria-*-Attribute entfernen oder die Rolle des Elements korrigieren.',
    mechanicallyFixable: true,
  },
  'aria-allowed-role': {
    titleDe: 'Unzulässige ARIA-Rolle',
    descriptionDe: 'Die gesetzte role passt nicht zum verwendeten HTML-Element.',
    remediationDe:
      'Ein semantisch passendes HTML-Element verwenden statt eine Rolle darüberzulegen.',
    mechanicallyFixable: true,
  },
  'aria-command-name': {
    titleDe: 'Bedienelement ohne zugänglichen Namen',
    descriptionDe:
      'Ein Element mit der Rolle button, link oder menuitem hat keinen Namen. Screenreader-Nutzende hören nur „Schaltfläche“.',
    remediationDe: 'Sichtbaren Text ergänzen oder aria-label bzw. aria-labelledby setzen.',
    mechanicallyFixable: false,
  },
  'aria-hidden-body': {
    titleDe: 'Seiteninhalt vollständig vor Hilfstechnologien verborgen',
    descriptionDe:
      'Auf <body> ist aria-hidden="true" gesetzt. Die gesamte Seite ist für Screenreader unsichtbar.',
    remediationDe: 'aria-hidden auf dem body-Element entfernen.',
    mechanicallyFixable: true,
    severity: 'critical',
  },
  'aria-hidden-focus': {
    titleDe: 'Verborgene Elemente sind per Tastatur erreichbar',
    descriptionDe:
      'Ein mit aria-hidden ausgeblendetes Element ist trotzdem fokussierbar. Die Tastaturnavigation landet auf Elementen, die der Screenreader nicht ansagt.',
    remediationDe:
      'Fokussierbare Kinder aus dem aria-hidden-Bereich entfernen oder mit tabindex="-1" und inert aus der Tabreihenfolge nehmen.',
    mechanicallyFixable: true,
  },
  'aria-input-field-name': {
    titleDe: 'ARIA-Eingabefeld ohne Namen',
    descriptionDe: 'Ein per ARIA ausgezeichnetes Eingabefeld hat keinen zugänglichen Namen.',
    remediationDe: 'aria-label oder aria-labelledby ergänzen.',
    mechanicallyFixable: false,
  },
  'aria-required-attr': {
    titleDe: 'Pflicht-ARIA-Attribute fehlen',
    descriptionDe:
      'Eine ARIA-Rolle verlangt bestimmte Attribute (z. B. aria-checked bei role="checkbox"), die fehlen.',
    remediationDe: 'Die von der Rolle geforderten aria-*-Attribute ergänzen und pflegen.',
    mechanicallyFixable: true,
  },
  'aria-required-children': {
    titleDe: 'ARIA-Rolle ohne die erforderlichen Kindelemente',
    descriptionDe:
      'Eine zusammengesetzte Rolle (z. B. list, tablist) enthält nicht die erwarteten Kindrollen. Die Struktur wird falsch angesagt.',
    remediationDe:
      'Die Kindelemente mit den passenden Rollen versehen oder auf natives HTML umstellen.',
    mechanicallyFixable: false,
  },
  'aria-required-parent': {
    titleDe: 'ARIA-Rolle ohne das erforderliche Elternelement',
    descriptionDe: 'Eine Rolle steht außerhalb des von ARIA geforderten Elternelements.',
    remediationDe: 'Das Element in den korrekten Container einbetten.',
    mechanicallyFixable: false,
  },
  'aria-roles': {
    titleDe: 'Ungültige ARIA-Rolle',
    descriptionDe: 'Es wird eine role verwendet, die es in ARIA nicht gibt.',
    remediationDe: 'Rollennamen korrigieren oder entfernen.',
    mechanicallyFixable: true,
  },
  'aria-toggle-field-name': {
    titleDe: 'Umschalter ohne zugänglichen Namen',
    descriptionDe: 'Ein Schalter oder eine Checkbox mit ARIA-Rolle hat keinen Namen.',
    remediationDe: 'Beschriftung per Text, aria-label oder aria-labelledby ergänzen.',
    mechanicallyFixable: false,
  },
  'aria-valid-attr-value': {
    titleDe: 'Ungültiger Wert eines ARIA-Attributs',
    descriptionDe:
      'Ein aria-*-Attribut verweist auf eine ID, die es nicht gibt, oder hat einen unzulässigen Wert.',
    remediationDe: 'Referenzierte IDs prüfen und die Werte auf zulässige Angaben korrigieren.',
    mechanicallyFixable: true,
  },
  'button-name': {
    titleDe: 'Schaltfläche ohne Beschriftung',
    descriptionDe:
      'Eine Schaltfläche — häufig ein Icon-Button wie Warenkorb, Suche oder Menü — hat keinen Text. Screenreader sagen nur „Schaltfläche“ an, die Funktion bleibt unbekannt.',
    remediationDe:
      'Visuell verborgenen Text (.visually-hidden) im Button ergänzen oder aria-label setzen, z. B. aria-label="Warenkorb öffnen".',
    mechanicallyFixable: false,
    severity: 'critical',
  },
  bypass: {
    titleDe: 'Kein Sprunglink zum Hauptinhalt',
    descriptionDe:
      'Es gibt keine Möglichkeit, die Navigation zu überspringen. Tastaturnutzende müssen auf jeder Seite erneut durch das gesamte Menü tabben.',
    remediationDe:
      'Als erstes fokussierbares Element einen Sprunglink („Zum Inhalt springen“) auf #main einfügen, der bei Fokus sichtbar wird.',
    mechanicallyFixable: true,
  },
  'color-contrast': {
    titleDe: 'Zu geringer Farbkontrast bei Text',
    descriptionDe:
      'Text und Hintergrund unterschreiten das geforderte Kontrastverhältnis von 4,5:1 (bzw. 3:1 bei großer Schrift). Betroffen sind bei Shops typischerweise Preisangaben, Hinweistexte, Platzhalter und die Fußzeile.',
    remediationDe:
      'Farbwerte im Theme-Design-Token anpassen, bis 4,5:1 erreicht ist. Betrifft meist wenige zentrale Variablen und wirkt sich auf alle Templates aus.',
    mechanicallyFixable: true,
    severity: 'serious',
  },
  'color-contrast-enhanced': {
    titleDe: 'Kontrast unterschreitet den erhöhten Wert (AAA)',
    descriptionDe:
      'Hinweis unterhalb der Prüfstufe AA. Für die BFSG-relevante Stufe AA nicht erforderlich.',
    remediationDe: 'Optional. Nicht Teil des Prüfumfangs WCAG 2.1 AA.',
    mechanicallyFixable: true,
    severity: 'minor',
  },
  'definition-list': {
    titleDe: 'Fehlerhafte Definitionsliste',
    descriptionDe: '<dl> enthält andere Elemente als <dt>/<dd>. Die Struktur wird falsch angesagt.',
    remediationDe: 'Nur zulässige Kindelemente in Definitionslisten verwenden.',
    mechanicallyFixable: true,
  },
  dlitem: {
    titleDe: 'Listenelement außerhalb einer Definitionsliste',
    descriptionDe: '<dt> oder <dd> steht nicht innerhalb eines <dl>.',
    remediationDe: 'Elemente in ein <dl> einbetten.',
    mechanicallyFixable: true,
  },
  'document-title': {
    titleDe: 'Seite ohne Titel',
    descriptionDe:
      'Der Seite fehlt ein <title>. Nutzende können Tabs und Verlauf nicht unterscheiden; Screenreader lesen beim Laden keinen Seitennamen vor.',
    remediationDe: 'Aussagekräftigen, pro Template unterschiedlichen <title> setzen.',
    mechanicallyFixable: true,
  },
  'duplicate-id-aria': {
    titleDe: 'Doppelte IDs in ARIA-Referenzen',
    descriptionDe:
      'Eine ID kommt mehrfach vor und wird von ARIA referenziert. Die Zuordnung von Beschriftungen wird zufällig.',
    remediationDe: 'IDs eindeutig vergeben, insbesondere in wiederholten Template-Bausteinen.',
    mechanicallyFixable: true,
  },
  'form-field-multiple-labels': {
    titleDe: 'Eingabefeld mit mehreren Beschriftungen',
    descriptionDe:
      'Ein Feld hat mehr als ein <label>. Die Ansage ist je nach Hilfstechnologie unterschiedlich.',
    remediationDe: 'Auf ein <label> reduzieren, weitere Hinweise über aria-describedby anbinden.',
    mechanicallyFixable: true,
  },
  'frame-title': {
    titleDe: 'iframe ohne Titel',
    descriptionDe:
      'Ein eingebetteter Rahmen (z. B. Kartendienst, Videoplayer, Bewertungswidget) hat kein title-Attribut.',
    remediationDe: 'title-Attribut mit dem Zweck des Rahmens setzen, z. B. title="Standortkarte".',
    mechanicallyFixable: true,
  },
  'heading-order': {
    titleDe: 'Überschriftenebenen springen',
    descriptionDe:
      'Die Überschriftenhierarchie überspringt Ebenen (z. B. h2 direkt gefolgt von h4). Screenreader-Nutzende navigieren primär über Überschriften und verlieren dadurch die Struktur.',
    remediationDe:
      'Überschriftenebenen im Template lückenlos vergeben; Größe rein über CSS steuern.',
    mechanicallyFixable: true,
  },
  'html-has-lang': {
    titleDe: 'Sprache der Seite nicht angegeben',
    descriptionDe:
      'Dem <html>-Element fehlt das lang-Attribut. Screenreader wählen dadurch die falsche Aussprache — deutscher Text wird englisch vorgelesen.',
    remediationDe: 'lang="de" im Layout-Template setzen.',
    mechanicallyFixable: true,
  },
  'html-lang-valid': {
    titleDe: 'Ungültige Sprachangabe',
    descriptionDe: 'Das lang-Attribut enthält keinen gültigen Sprachcode.',
    remediationDe: 'Gültigen BCP-47-Code verwenden, z. B. "de" oder "de-DE".',
    mechanicallyFixable: true,
  },
  'image-alt': {
    titleDe: 'Bild ohne Alternativtext',
    descriptionDe:
      'Ein Bild hat kein alt-Attribut. Bei Produktbildern bleibt der Artikel für blinde Nutzende unbenannt.',
    remediationDe:
      'Inhaltsbilder mit beschreibendem alt versehen (im Shop meist aus dem Produkttitel), rein dekorative Bilder mit alt="".',
    mechanicallyFixable: false,
    severity: 'critical',
  },
  'image-redundant-alt': {
    titleDe: 'Alternativtext wiederholt den danebenstehenden Text',
    descriptionDe: 'Der Alternativtext eines Bildes doppelt den unmittelbar benachbarten Linktext.',
    remediationDe: 'Bei rein dekorativer Wiederholung alt="" setzen.',
    mechanicallyFixable: false,
    severity: 'minor',
  },
  'input-button-name': {
    titleDe: 'Eingabe-Schaltfläche ohne Beschriftung',
    descriptionDe: '<input type="submit|button|reset"> hat keinen value- oder aria-label-Wert.',
    remediationDe: 'value- oder aria-label-Attribut setzen.',
    mechanicallyFixable: true,
  },
  'input-image-alt': {
    titleDe: 'Grafische Schaltfläche ohne Alternativtext',
    descriptionDe: '<input type="image"> hat kein alt-Attribut; die Funktion ist nicht erkennbar.',
    remediationDe: 'alt-Attribut mit der Funktion der Schaltfläche setzen.',
    mechanicallyFixable: false,
  },
  label: {
    titleDe: 'Formularfeld ohne Beschriftung',
    descriptionDe:
      'Ein Eingabefeld hat keine programmatisch verknüpfte Beschriftung. Im Checkout führt das dazu, dass Screenreader-Nutzende nicht erfahren, welche Angabe erwartet wird — die Bestellung ist damit praktisch nicht abschließbar.',
    remediationDe:
      '<label for="…"> mit dem Feld verknüpfen. Ein Platzhalter (placeholder) ersetzt keine Beschriftung.',
    mechanicallyFixable: false,
    severity: 'critical',
  },
  'label-title-only': {
    titleDe: 'Beschriftung nur über title oder placeholder',
    descriptionDe:
      'Das Feld ist ausschließlich über title oder placeholder benannt. Diese Angaben verschwinden bei Eingabe bzw. werden nicht zuverlässig angesagt.',
    remediationDe: 'Sichtbares <label> ergänzen.',
    mechanicallyFixable: false,
  },
  'landmark-one-main': {
    titleDe: 'Kein eindeutiger Hauptbereich',
    descriptionDe:
      'Die Seite hat keinen oder mehr als einen <main>-Bereich. Der Sprung zum Inhalt funktioniert dadurch nicht verlässlich.',
    remediationDe: 'Genau ein <main>-Element im Layout auszeichnen.',
    mechanicallyFixable: true,
  },
  'link-in-text-block': {
    titleDe: 'Links im Fließtext nur durch Farbe erkennbar',
    descriptionDe:
      'Links unterscheiden sich vom umgebenden Text ausschließlich durch die Farbe und erreichen nicht den nötigen Kontrast zu ihr.',
    remediationDe: 'Links unterstreichen oder anderweitig nicht-farblich kennzeichnen.',
    mechanicallyFixable: true,
  },
  'link-name': {
    titleDe: 'Link ohne erkennbaren Text',
    descriptionDe:
      'Ein Link hat keinen Text — typisch bei Icon-Links (Konto, Wunschliste, Social Media) und bei mit Bildern verlinkten Produktkacheln.',
    remediationDe:
      'Verborgenen Linktext ergänzen oder aria-label setzen; bei Bildlinks das alt des Bildes als Linktext nutzen.',
    mechanicallyFixable: false,
    severity: 'serious',
  },
  list: {
    titleDe: 'Fehlerhafte Listenstruktur',
    descriptionDe:
      '<ul>/<ol> enthält andere Kindelemente als <li>. Die Anzahl der Einträge wird falsch angesagt.',
    remediationDe: 'Nur <li> als direkte Kinder verwenden; Wrapper nach innen verschieben.',
    mechanicallyFixable: true,
  },
  listitem: {
    titleDe: '<li> außerhalb einer Liste',
    descriptionDe: 'Ein Listeneintrag steht nicht in <ul> oder <ol>.',
    remediationDe: 'Listeneinträge in eine Liste einbetten.',
    mechanicallyFixable: true,
  },
  marquee: {
    titleDe: 'Veraltetes <marquee>-Element',
    descriptionDe: 'Laufschrift lässt sich nicht anhalten und ist für viele Nutzende unlesbar.',
    remediationDe: '<marquee> entfernen.',
    mechanicallyFixable: true,
  },
  'meta-refresh': {
    titleDe: 'Automatische Weiterleitung per meta refresh',
    descriptionDe:
      'Die Seite lädt sich selbst neu oder leitet weiter, ohne dass dies abschaltbar ist.',
    remediationDe: 'meta refresh entfernen; serverseitig weiterleiten.',
    mechanicallyFixable: true,
  },
  'meta-viewport': {
    titleDe: 'Zoom unterbunden',
    descriptionDe:
      'Die viewport-Angabe verhindert das Vergrößern der Seite (user-scalable=no oder maximum-scale). Nutzende mit Sehbeeinträchtigung können den Shop auf dem Smartphone nicht vergrößern.',
    remediationDe: 'user-scalable=no und maximum-scale aus dem viewport-meta-Tag entfernen.',
    mechanicallyFixable: true,
    severity: 'serious',
  },
  'nested-interactive': {
    titleDe: 'Verschachtelte Bedienelemente',
    descriptionDe:
      'Ein fokussierbares Element liegt innerhalb eines anderen (z. B. Button im Link). Hilfstechnologien geben die Struktur unvorhersehbar wieder.',
    remediationDe: 'Bedienelemente nebeneinander statt ineinander verschachteln.',
    mechanicallyFixable: false,
  },
  'object-alt': {
    titleDe: '<object> ohne Textalternative',
    descriptionDe: 'Ein eingebettetes Objekt hat keine Alternative.',
    remediationDe: 'Textalternative innerhalb des <object> hinterlegen.',
    mechanicallyFixable: false,
  },
  'p-as-heading': {
    titleDe: 'Absatz wird als Überschrift dargestellt',
    descriptionDe:
      'Ein Absatz sieht wie eine Überschrift aus, ist aber keine. Screenreader-Nutzende finden ihn bei der Überschriftennavigation nicht.',
    remediationDe: 'Echte <h2>–<h4>-Elemente verwenden und per CSS gestalten.',
    mechanicallyFixable: false,
  },
  'role-img-alt': {
    titleDe: 'Element mit role="img" ohne Namen',
    descriptionDe: 'Ein als Bild ausgezeichnetes Element hat keinen zugänglichen Namen.',
    remediationDe: 'aria-label ergänzen.',
    mechanicallyFixable: false,
  },
  'scrollable-region-focusable': {
    titleDe: 'Scrollbereich nicht per Tastatur erreichbar',
    descriptionDe:
      'Ein scrollbarer Bereich (häufig eine Produkttabelle) lässt sich ohne Maus nicht scrollen.',
    remediationDe: 'Dem Container tabindex="0" und eine passende Rolle bzw. Beschriftung geben.',
    mechanicallyFixable: true,
  },
  'select-name': {
    titleDe: 'Auswahlfeld ohne Beschriftung',
    descriptionDe:
      'Ein <select> — im Shop typisch für Größe, Farbe oder Versandland — hat keine verknüpfte Beschriftung.',
    remediationDe: '<label for="…"> ergänzen.',
    mechanicallyFixable: false,
  },
  'server-side-image-map': {
    titleDe: 'Serverseitige Image-Map',
    descriptionDe: 'Serverseitige Bildkarten sind mit der Tastatur nicht bedienbar.',
    remediationDe: 'Durch Links oder eine clientseitige Image-Map ersetzen.',
    mechanicallyFixable: false,
  },
  'svg-img-alt': {
    titleDe: 'SVG-Grafik ohne Textalternative',
    descriptionDe: 'Eine als Bild ausgezeichnete SVG-Grafik hat keinen zugänglichen Namen.',
    remediationDe: '<title> im SVG oder aria-label am Element ergänzen.',
    mechanicallyFixable: false,
  },
  'td-headers-attr': {
    titleDe: 'Tabellenzelle verweist auf nicht vorhandene Kopfzelle',
    descriptionDe: 'Das headers-Attribut referenziert IDs, die in der Tabelle nicht existieren.',
    remediationDe: 'headers-Referenzen korrigieren.',
    mechanicallyFixable: true,
  },
  'th-has-data-cells': {
    titleDe: 'Tabellenkopf ohne zugeordnete Datenzellen',
    descriptionDe:
      'Kopfzellen sind nicht mit Datenzellen verknüpft; die Tabelle wird falsch vorgelesen.',
    remediationDe: 'scope- oder headers-Attribute setzen.',
    mechanicallyFixable: true,
  },
  'valid-lang': {
    titleDe: 'Ungültige Sprachangabe an einem Element',
    descriptionDe: 'Ein lang-Attribut im Seiteninhalt enthält keinen gültigen Sprachcode.',
    remediationDe: 'Gültigen BCP-47-Code verwenden.',
    mechanicallyFixable: true,
  },
  'video-caption': {
    titleDe: 'Video ohne Untertitel',
    descriptionDe: 'Ein <video>-Element bietet keine Untertitelspur.',
    remediationDe:
      'Untertitel als <track kind="captions"> einbinden. Untertitelung selbst ist nicht Teil des Leistungsumfangs.',
    mechanicallyFixable: false,
  },
};

/** German copy for Lighthouse-only audits that have no axe rule equivalent. */
export const LIGHTHOUSE_ONLY_COPY: Readonly<Record<string, RuleCopy & { criteria: string[] }>> = {
  'target-size': {
    titleDe: 'Zu kleine Klickflächen',
    descriptionDe:
      'Bedienelemente sind kleiner als die empfohlene Mindestgröße. Betrifft vor allem die mobile Bedienung.',
    remediationDe: 'Klickflächen auf mindestens 24 × 24 CSS-Pixel vergrößern.',
    mechanicallyFixable: true,
    severity: 'moderate',
    // WCAG 2.2 criterion — reported as information only, outside the AA 2.1 scope.
    criteria: [],
  },
};
