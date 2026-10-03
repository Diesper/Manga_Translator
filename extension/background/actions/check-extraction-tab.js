'use strict';
// background/actions/check-extraction-tab.js — Identifica abas temporárias de extração

(function(scope) {
  if (!scope.MangaTranslatorRouter) {
    throw new Error('MangaTranslatorRouter indisponível');
  }

  scope.MangaTranslatorRouter.registerAction({
    name: 'check-extraction-tab',
    meta: { allowedSources: ['any'] },
    async execute(_request, context) {
      await context.ensureInitialized();
      const tabId = context.sender && context.sender.tab ? context.sender.tab.id : -1;
      const extractionTabs = context.state && context.state.extractionTabs;
      const hasMapping = extractionTabs
        && typeof extractionTabs === 'object'
        && !Array.isArray(extractionTabs)
        && Object.prototype.hasOwnProperty.call(extractionTabs, tabId);
      const mapping = hasMapping ? extractionTabs[tabId] : null;

      if (mapping && typeof mapping === 'object' && !Array.isArray(mapping)) {
        return { ...mapping, isExtractionTab: true };
      }

      return { isExtractionTab: false };
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
