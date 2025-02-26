async function getCurrentTabInfo() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function getAllCookies(url) {
  const cookies = await chrome.cookies.getAll({ url });
  return cookies.reduce((acc, cookie) => {
    acc[cookie.name] = cookie.value;
    return acc;
  }, {});
}

async function getTransactionId(url) {
  try {
    if (!url.includes('revolut.com')) return null;

    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/");
    const transactionIndex = pathParts.indexOf("transactions");

    let transactionId = null;
    if (transactionIndex !== -1 && pathParts[transactionIndex + 1]) {
      transactionId = pathParts[transactionIndex + 1];
    }
    if (!transactionId) {
      transactionId = urlObj.searchParams.get("transactionId");
    }
    return transactionId;
  } catch (e) {
    console.error("Error parsing URL:", e);
    return null;
  }
}

async function getHeaders() {
  const tab = await getCurrentTabInfo();
  const cookies = await getAllCookies('https://app.revolut.com');
  const headers = {};

  if (tab.url && tab.url.includes('revolut.com')) {
    headers['x-device-id'] = cookies.revo_device_id || '';
    headers['sec-ch-ua'] = navigator.userAgent.split('Chrome/')[1]?.split(' ')[0] || '';
    headers['x-browser-application'] = cookies.x_browser_application || 'WEB_CLIENT';
    headers['x-timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone;
    headers['sec-ch-ua-mobile'] = navigator.userAgent.includes('Mobile') ? '?1' : '?0';
    headers['baggage'] = cookies.baggage || '';
    headers['sentry-trace'] = cookies['sentry-trace'] || '';
    headers['user-agent'] = navigator.userAgent;
    headers['accept'] = tab.url.includes('/api/') ? 'application/json' : '*/*';
    headers['x-client-version'] = cookies.x_client_version || '';
    headers['sec-gpc'] = '1';
    headers['accept-language'] = navigator.language;
    headers['sec-fetch-site'] = 'same-origin';
    headers['sec-fetch-mode'] = 'cors';
    headers['sec-fetch-dest'] = 'empty';
    headers['referer'] = tab.url;
    headers['cookie'] = Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; ');
  }

  Object.keys(headers).forEach(key => {
    if (!headers[key]) delete headers[key];
  });

  return headers;
}

const nativeButtonListener = async () => {
  const messageDiv = document.getElementById("message");
  const transactionDiv = document.getElementById("transaction");
  const logContainer = document.getElementById("logContainer");
  const logMessage = document.getElementById("logMessage");

  try {
    const tab = await getCurrentTabInfo();
    const transactionId = await getTransactionId(tab.url);

    if (!transactionId) {
      messageDiv.textContent = "No transaction ID available.";
      messageDiv.style.color = "red";
      messageDiv.style.display = "block";
      return;
    }

    const headers = await getHeaders();
    const apiUrl = `https://app.revolut.com/api/retail/transaction/${transactionId}`;

    const response = await fetch(apiUrl, { method: "GET", headers });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const responseData = await response.json();
    if (!responseData || responseData.length === 0) {
      messageDiv.textContent = "No transaction data found.";
      messageDiv.style.color = "red";
      messageDiv.style.display = "block";
      return;
    }

    const transaction = responseData[0];
    const currency = transaction.currency || "N/A";
    const amount = transaction.amount || "N/A";
    const description = transaction.description || "No description available";

    transactionDiv.innerHTML = `
      <strong>Transaction ID:</strong> ${transaction.id}<br>
      <strong>Currency:</strong> ${currency}<br>
      <strong>Amount:</strong> ${amount / 100} ${currency}<br>
      <strong>Description:</strong> ${description}
    `;
    transactionDiv.style.display = "block";

    // Aktualizowanie statusu
    updateStatus("Processing transaction...", "status-warning");

    const data = {
      server_uri: apiUrl,
      verifier_address: "81.219.135.164:30079",
      headers: Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
      max_sent_data: 4096,
      max_recv_data: 16384,
    };

    chrome.runtime.sendMessage({ type: "nativeMessage", data }, response => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        updateStatus("Error sending to native app", "status-error");
        return;
      }
      if (response.status === "error") {
        updateStatus("Error: " + (response.message || "Unknown issue"), "status-error");
        return;
      }
    });

  } catch (err) {
    console.error('Error:', err);
    messageDiv.textContent = "Failed to send to native app.";
    messageDiv.style.color = "red";
    messageDiv.style.display = "block";
    updateStatus("Transaction failed.", "status-error");
  }
};

const updateStatus = (message, statusClass) => {
  const logMessage = document.getElementById("logMessage");
  const logContainer = document.getElementById("logContainer");

  logMessage.textContent = message;

  logContainer.classList.remove("status-success", "status-warning", "status-error");

  logContainer.classList.add(statusClass);
};

const messageListener = (message) => {
  if (message.type === "nativeResponse") {
    if (message.data.type === "Logging") {
      const logText = message.data.message.logging;

      console.log("Logging:", logText);

      if (logText.includes("successfully")) {
        updateStatus(logText, "status-success"); 
      } else if (logText.includes("failed")) {
        updateStatus(logText, "status-error"); 
      } else {
        updateStatus(logText, "status-warning"); 
      }
    }
  }
};

chrome.runtime.onMessage.addListener(messageListener);

window.addEventListener('unload', () => {
  chrome.runtime.onMessage.removeListener(messageListener);
});

document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("native").addEventListener("click", nativeButtonListener);
});
