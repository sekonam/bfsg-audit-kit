import type { StatementAnswers } from '../../src/core/statement/model.ts';
import { parseStatementAnswers } from '../../src/core/statement/model.ts';

/** A fully filled, valid set of answers — the shape a real customer produces. */
export function sampleStatementInput(): unknown {
  return {
    provider: {
      name: 'Musterschuhe GmbH',
      legalForm: 'GmbH',
      address: {
        street: 'Musterstraße 1',
        postalCode: '12345',
        city: 'Musterstadt',
        country: 'Deutschland',
      },
      email: 'kontakt@musterschuhe.example',
      phone: '+49 30 1234567',
      website: 'https://www.musterschuhe.example',
    },
    service: {
      name: 'Onlineshop Musterschuhe',
      url: 'https://www.musterschuhe.example',
      description:
        'In diesem Onlineshop verkaufen wir Schuhe an Privatkundinnen und Privatkunden. ' +
        'Sie können Schuhe aussuchen, in den Warenkorb legen und bestellen. Die Lieferung ' +
        'erfolgt per Paketdienst an die von Ihnen angegebene Adresse.',
      understandingNotes: [
        'Sie können ohne Kundenkonto bestellen.',
        'Die Bestellung erfolgt in vier Schritten: Warenkorb, Adresse, Zahlungsart, Bestätigung.',
        'Sie erhalten nach der Bestellung eine Bestätigung per E-Mail.',
      ],
    },
    conformance: {
      standard: 'EN 301 549 (Kapitel 9) / WCAG 2.1 Stufe AA',
      status: 'teilweise',
      measures: [
        'Alle Bedienelemente sind mit der Tastatur erreichbar und haben einen sichtbaren Fokus.',
        'Texte erfüllen ein Kontrastverhältnis von mindestens 4,5:1.',
        'Alle Formularfelder im Bestellprozess haben eine verknüpfte Beschriftung.',
      ],
      knownBarriers: [
        {
          description:
            'Die eingebundene Karte auf der Seite „Filialen“ ist nicht tastaturbedienbar.',
          reason: 'Es handelt sich um einen Dienst eines Drittanbieters.',
          alternative: 'Alle Filialadressen stehen als Text auf derselben Seite.',
          plannedFix: 'Ersatz des Kartendienstes bis Q2/2027 geplant.',
        },
      ],
    },
    feedback: {
      contactName: 'Frau Muster',
      email: 'barrierefreiheit@musterschuhe.example',
      phone: '+49 30 1234568',
      responseTimeDays: 14,
    },
    authority: {
      name: 'Zuständige Marktüberwachungsbehörde (im Test eingesetzt)',
      address: {
        street: 'Behördenweg 2',
        postalCode: '39104',
        city: 'Magdeburg',
        country: 'Deutschland',
      },
      email: 'kontakt@behoerde.example',
      url: 'https://www.behoerde.example',
      verifiedOn: '2026-09-01',
    },
    meta: {
      createdOn: '2026-09-01',
      lastReviewedOn: '2026-09-01',
      basis: 'externe-pruefung',
      legalReviewConfirmed: true,
    },
  };
}

export function sampleStatement(): StatementAnswers {
  return parseStatementAnswers(sampleStatementInput());
}
