document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('[data-source-row]').forEach(function (row) {
    var select = row.querySelector('[data-source-type-select]');
    var bibliography = row.querySelector('[data-source-bibliography]');
    var quran = row.querySelector('[data-source-quran]');

    if (!select || !bibliography || !quran) {
      return;
    }

    function clearInputs(container) {
      container.querySelectorAll('input').forEach(function (input) {
        input.value = '';
      });
    }

    function sync() {
      var isQuran = select.value === 'QURAN';
      bibliography.hidden = isQuran;
      quran.hidden = !isQuran;
    }

    // Only clears on a live switch, never on load — the initial paint must preserve whatever
    // was saved (e.g. a legacy Quran source with a hand-typed title and no surah/ayah).
    select.addEventListener('change', function () {
      clearInputs(select.value === 'QURAN' ? bibliography : quran);
      sync();
    });

    sync();
  });
});
