window.PluginDeck = {
  invoke: async (action) => {
    if (action === "remote") {
      await new Promise((resolve) => setTimeout(resolve, 650));
    }
    return { detail: JSON.stringify(parent.previewResponses[action] || {}) };
  }
};
