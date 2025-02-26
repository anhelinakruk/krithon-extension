chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "nativeMessage") {

    const port = chrome.runtime.connectNative("com.notary.krithon");

    const data = request.data;
    if (!data.server_uri || !data.headers) {
      console.error("Invalid data format");
      sendResponse({ status: "error", message: "Invalid data format" });
      return true;
    }

    port.postMessage({
      server_uri: data.server_uri,
      verifier_address: data.verifier_address,
      headers: data.headers,
      max_sent_data: data.max_sent_data,
      max_recv_data: data.max_recv_data,
    });

    port.onMessage.addListener((response) => {
      try {
        chrome.runtime.sendMessage({
          type: "nativeResponse",
          data: response
        }).catch(err => {
          if (!err.message.includes("Receiving end does not exist")) {
            console.error("Error sending message:", err);
          }
        });
      } catch (e) {
        console.error("Error processing native app response:", e);
      }
    });

    port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) {
        console.error("Native messaging error:", chrome.runtime.lastError.message);
      }
      console.log("Disconnected from native app");
    });

    sendResponse({ status: "Message sent to native app" });
  }
  return true;
}); 