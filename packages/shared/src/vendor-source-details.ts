export interface VendorSourceDetails {
  addressLine?: string;
  contactEmail?: string;
  contactPhone?: string;
  openingHours?: string[];
  contactSourceUrl?: string;
  contactSourceLabel?: string;
  pricingSourceUrl?: string;
  pricingSourceLabel?: string;
  pricingNotes?: string;
}

export const vendorSourceDetailsById: Record<string, VendorSourceDetails> = {
  "blumen-jast-speyer": {
    contactEmail: "info@blumen-jast.de",
    contactSourceUrl: "https://www.blumen-jast.de/impressum",
    contactSourceLabel: "Offizielles Impressum",
    openingHours: [
      "Montag bis Freitag 08:00-18:00 Uhr",
      "Samstag 08:00-16:00 Uhr",
      "Sonntag 10:00-12:00 Uhr"
    ]
  },
  "blumen-schad": {
    addressLine: "Branchweilerhofstrasse 117, 67433 Neustadt an der Weinstrasse",
    contactEmail: "info@blumen-schad.de",
    contactPhone: "06321 13214",
    contactSourceUrl: "https://www.blumen-schad.de/impressum",
    contactSourceLabel: "Offizielles Impressum",
    openingHours: [
      "Montag bis Freitag 08:30-18:00 Uhr",
      "Samstag 08:30-12:00 Uhr"
    ]
  },
  "blumenhaus-burkard": {
    contactEmail: "info@blumen-burkard.de",
    contactPhone: "0151 25290750",
    contactSourceUrl: "https://blumen-burkard.de/",
    contactSourceLabel: "Offizielle Website"
  },
  "der-jaeger-kochts": {
    contactEmail: "kontakt@der-jaeger-kochts.de",
    contactPhone: "+49 171 3298175",
    contactSourceUrl: "https://www.der-jaeger-kochts.de/kontakt/",
    contactSourceLabel: "Offizielle Kontaktseite"
  },
  "hassloch-event-taste": {
    addressLine: "Fronmuhle 2, 67454 Hassloch",
    contactEmail: "info@eventtaste.de",
    contactPhone: "+49 176 99999007",
    contactSourceUrl: "https://www.eventtaste.de/eventtastekontakt",
    contactSourceLabel: "Offizielle Kontaktseite"
  },
  "speyer-foto-speyer": {
    contactEmail: "info@foto-speyer.de",
    contactPhone: "0179 2057479",
    contactSourceUrl: "https://www.foto-speyer.de/hochzeitsfotograf",
    contactSourceLabel: "Offizielle Fotografie-Seite"
  },
  "neustadt-lina-wissen": {
    addressLine: "Am Speyerbach 32, 67433 Neustadt an der Weinstrasse",
    contactEmail: "lina.wissen@gmail.com",
    contactPhone: "+49 179 6658434",
    contactSourceUrl: "https://www.linawissen.com/impressum",
    contactSourceLabel: "Offizielles Impressum"
  },
  "landau-luckies-catering": {
    contactEmail: "info@luckies-catering.de",
    contactPhone: "+49 163 7326588",
    contactSourceUrl: "https://luckies-catering.de/kontakt/",
    contactSourceLabel: "Offizielle Kontaktseite"
  },
  "pfalz-markus-husner": {
    contactEmail: "foto@markushusner.com",
    contactPhone: "+49 176 70598737",
    contactSourceUrl: "https://www.markushusner.com/impressum",
    contactSourceLabel: "Offizielles Impressum"
  },
  "mihael-klaudija-prebezac": {
    contactEmail: "info@prebezac.de",
    contactPhone: "+49 151 58743309",
    contactSourceUrl: "https://hochzeiten.prebezac.de/impressum/",
    contactSourceLabel: "Offizielles Impressum"
  },
  "hassloch-nicitello": {
    addressLine: "Muller-Thurgau-Strasse 9, 67454 Hassloch",
    contactEmail: "info@nicitello.de",
    contactPhone: "0152 07059850",
    contactSourceUrl: "https://www.nicitello.de/kontakt/",
    contactSourceLabel: "Offizielle Kontaktseite"
  },
  "roger-rachel-photography": {
    contactEmail: "info@roger-rachel.de",
    contactPhone: "+49 6353 915999",
    contactSourceUrl: "https://www.roger-rachel.de/impressum/",
    contactSourceLabel: "Offizielles Impressum"
  },
  "speyer-straub-catering": {
    contactEmail: "info@straub-catering.de",
    contactPhone: "06232 699930",
    contactSourceUrl: "https://www.straub-catering.de/impressum/",
    contactSourceLabel: "Offizielles Impressum"
  },
  "gut-rehbach": {
    addressLine: "Sagmuhlweg 140, 67454 Hassloch",
    contactEmail: "info@gut-rehbach.de",
    contactSourceUrl: "https://www.gut-rehbach.de/",
    contactSourceLabel: "Offizielle Website"
  },
  "hotel-schloss-edesheim": {
    addressLine: "Luitpoldstrasse 9, 67483 Edesheim",
    contactEmail: "info@schloss-edesheim.de",
    contactPhone: "06323 94240",
    contactSourceUrl: "https://www.schloss-edesheim.de/impressum/",
    contactSourceLabel: "Offizielles Impressum"
  },
  "deidesheim-rebe": {
    addressLine: "Steingasse 2, 67146 Deidesheim",
    contactEmail: "events@rebe-deidesheim.de",
    contactPhone: "+49 160 94843398",
    contactSourceUrl: "https://www.rebe-deidesheim.de/kontakt",
    contactSourceLabel: "Offizielle Kontaktseite"
  },
  "basten-kocht": {
    contactEmail: "mail@bastenkocht.de",
    contactPhone: "+49 7223 2819203",
    contactSourceUrl: "https://bastenkocht.de/impressum/",
    contactSourceLabel: "Offizielles Impressum"
  },
  "dj-fisch3r": {
    contactEmail: "selina97fischer@web.de",
    contactPhone: "0162 4062962",
    contactSourceUrl: "https://dein-dj-party.de/kontakt/",
    contactSourceLabel: "Offizielle Kontaktseite"
  },
  "dj-franckey": {
    contactEmail: "info@djfranckey.com",
    contactPhone: "+49 176 21971339",
    contactSourceUrl: "https://djfranckey.com/kontakt/",
    contactSourceLabel: "Offizielle Kontaktseite"
  },
  "dj-jan-mitchell": {
    contactEmail: "info@dj-janmitchell.de",
    contactPhone: "+49 176 10380994",
    contactSourceUrl: "https://www.dj-janmitchell.de/kontakt/",
    contactSourceLabel: "Offizielle Kontaktseite"
  },
  "dj-stefan-kietz": {
    contactEmail: "stefan@pfalzdjs.de",
    contactPhone: "06323 9859030",
    contactSourceUrl: "https://www.djstefankietz.de/kontakt/",
    contactSourceLabel: "Offizielle Kontaktseite"
  },
  "iman-bader-bridal-styling": {
    addressLine: "Ludwigstrasse 94a, 67434 Neustadt an der Weinstrasse",
    contactEmail: "info@imanbader.de",
    contactPhone: "0163 5398542",
    contactSourceUrl: "https://imanbader.de/brautpakete/",
    contactSourceLabel: "Offizielle Brautpakete-Seite",
    pricingSourceUrl: "https://imanbader.de/brautpakete/",
    pricingSourceLabel: "Offizielle Brautpakete-Seite",
    pricingNotes: "Brautstyling-Pakete und Leistungsumfang laut offizieller Paketseite."
  },
  "johannes-staehly-catering": {
    contactEmail: "bestellungen@metzgerei-staehly.de",
    contactPhone: "06326 981326",
    contactSourceUrl: "https://www.metzgerei-staehly.de/",
    contactSourceLabel: "Offizielle Website",
    openingHours: [
      "Montag 07:30-12:30 und 14:30-18:00 Uhr",
      "Dienstag 07:30-12:30 und 14:30-18:00 Uhr",
      "Mittwoch geschlossen",
      "Donnerstag 07:30-12:30 und 14:30-18:00 Uhr",
      "Freitag 07:30-12:30 und 14:30-18:00 Uhr",
      "Samstag 07:00-12:30 Uhr"
    ]
  },
  "levianne-brautatelier": {
    contactEmail: "brautmode@levianne.de",
    contactPhone: "06322 6005966",
    contactSourceUrl: "https://levianne.de/kontakt/",
    contactSourceLabel: "Offizielle Kontaktseite",
    openingHours: [
      "Dienstag und Mittwoch 14:30-19:00 Uhr",
      "Donnerstag und Freitag 09:00-18:30 Uhr",
      "Samstag 09:30-16:00 Uhr"
    ]
  },
  "makeup-by-mel": {
    contactEmail: "info@makeupbymel.de",
    contactPhone: "0151 64300437",
    contactSourceUrl: "https://makeupbymel.de/impressum/",
    contactSourceLabel: "Offizielles Impressum",
    pricingSourceUrl:
      "https://makeupbymel.de/wp-content/uploads/2017/10/Preisliste-Brautmakeup.compressed.pdf",
    pricingSourceLabel: "Offizielle Preisliste",
    pricingNotes: "Brautmake-up und Begleitpreise laut offizieller Preisliste."
  },
  "marisa-hois-bridal-styling": {
    contactEmail: "info@marisahois-makeupartist.de",
    contactPhone: "+49 163 4361859",
    contactSourceUrl: "https://www.marisahois-makeupartist.de/impressum/",
    contactSourceLabel: "Offizielles Impressum"
  },
  "hassloch-the-space": {
    addressLine: "Fritz-Karl-Henkel-Strasse 13, 67454 Hassloch",
    contactEmail: "kontakt@the-space.bar",
    contactPhone: "+49 6324 9118281",
    contactSourceUrl: "https://the-space.bar/kontakt/",
    contactSourceLabel: "Offizielle Kontaktseite",
    openingHours: [
      "Montag bis Mittwoch 18:00-23:00 Uhr",
      "Donnerstag 18:00-00:00 Uhr",
      "Freitag und Samstag 18:00-01:00 Uhr",
      "Sonntag 18:00-23:00 Uhr"
    ]
  },
  "kulturviereck-hassloch": {
    addressLine: "Rathausplatz 1, 67454 Hassloch",
    contactSourceUrl: "https://hassloch.de/",
    contactSourceLabel: "Gemeinde Hassloch"
  },
  "deidesheimer-hof": {
    addressLine: "Marktplatz 1, 67146 Deidesheim",
    contactPhone: "06326 968733",
    contactSourceUrl: "https://www.deidesheimerhof.de/de/feiern3/hochzeitsfeiern/hochzeitsarrangement",
    contactSourceLabel: "Offizielle Hochzeitsseite",
    pricingSourceUrl:
      "https://www.deidesheimerhof.de/storage/app/media/Documents/Flyer%20Hochzeiten.pdf",
    pricingSourceLabel: "Offizieller Hochzeitsflyer",
    pricingNotes: "Hochzeitspauschalen pro Person laut offiziellem Flyer."
  },
  "neustadt-hambacher-schloss": {
    addressLine: "Hambacher Schloss 1832, 67434 Neustadt an der Weinstrasse",
    contactEmail: "info@hambacherschloss-pfalz.de",
    contactPhone: "+49 6321 9597880",
    contactSourceUrl: "https://www.hambacherschloss-pfalz.de/kontakt/",
    contactSourceLabel: "Offizielle Kontaktseite",
    pricingSourceUrl: "https://www.hambacherschloss-pfalz.de/hochzeitsbroschuere.pdf",
    pricingSourceLabel: "Offizielle Hochzeitsbroschuere",
    pricingNotes: "Raum- und Menueinformationen laut offizieller Hochzeitsbroschuere."
  },
  "villa-ludwigshoehe": {
    addressLine: "Villastrasse 64, 67480 Edenkoben",
    contactEmail: "info@villa-pfalz.de",
    contactSourceUrl: "https://villa-pfalz.de/",
    contactSourceLabel: "Offizielle Website",
    openingHours: [
      "Mittwoch bis Sonntag 10:30-17:30 Uhr"
    ]
  },
  "villa-boehm-neustadt": {
    contactEmail: "museum@neustadt.eu",
    contactPhone: "06321 8551540",
    contactSourceUrl: "https://stadtmuseum-neustadt.de/impressum",
    contactSourceLabel: "Offizielles Impressum"
  }
};

