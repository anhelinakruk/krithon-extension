async function getCurrentTabInfo() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  return tab;
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
    if (!url.includes('revolut.com')) {
      return null;
    }

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

  // Get headers from request
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
    headers['cookie'] = Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  // Remove empty headers
  Object.keys(headers).forEach(key => {
    if (!headers[key]) {
      delete headers[key];
    }
  });

  return headers;
}

// const curlButtonListener = async () => {
//   const messageDiv = document.getElementById("message");
//   try {
//     const tab = await getCurrentTabInfo();
//     const transactionId = await getTransactionId(tab.url);

//     if (!transactionId) {
//       messageDiv.textContent = "No transaction ID available.";
//       messageDiv.style.color = "red";
//       return;
//     }

//     const headers = await getHeaders();
//     const apiUrl = `https://app.revolut.com/api/retail/transaction/${transactionId}`;
//     const headerStr = Object.entries(headers)
//       .map(([name, value]) => `-H '${name}: ${value}'`)
//       .join(" ");
//     const command = `curl ${headerStr} '${apiUrl}'`;

//     await navigator.clipboard.writeText(command);
//     messageDiv.textContent = "Command copied to clipboard!";
//     messageDiv.style.color = "green";
//   } catch (err) {
//     console.error('Error:', err);
//     messageDiv.textContent = "Failed to copy command.";
//     messageDiv.style.color = "red";
//   }
// };

// const proveButtonListener = async () => {
//   const messageDiv = document.getElementById("message");
//   try {
//     const tab = await getCurrentTabInfo();
//     const transactionId = await getTransactionId(tab.url);

//     if (!transactionId) {
//       messageDiv.textContent = "No transaction ID available.";
//       messageDiv.style.color = "red";
//       return;
//     }

//     const headers = await getHeaders();
//     const apiUrl = `https://app.revolut.com/api/retail/transaction/${transactionId}`;
//     const headerStr = Object.entries(headers)
//       .map(([name, value]) => `-H '${name}: ${value}'`)
//       .join(" ");
//     const command = `cargo run -r -p prover -- ${headerStr} '${apiUrl}'`;

//     await navigator.clipboard.writeText(command);
//     messageDiv.textContent = "Command copied to clipboard!";
//     messageDiv.style.color = "green";
//   } catch (err) {
//     messageDiv.textContent = "Failed to copy command.";
//     messageDiv.style.color = "red";
//   }
// };

const nativeButtonListener = async () => {
  const messageDiv = document.getElementById("message");
  try {
    const tab = await getCurrentTabInfo();
    const transactionId = await getTransactionId(tab.url);

    if (!transactionId) {
      messageDiv.textContent = "No transaction ID available.";
      messageDiv.style.color = "red";
      return;
    }

    const headers = await getHeaders();
    const apiUrl = `https://app.revolut.com/api/retail/transaction/${transactionId}`;
    
    const headersList = Object.entries(headers)
      .map(([name, value]) => `${name}: ${value}`);

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: headers,
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
  
      const responseData = await response.json();
  
      if (!responseData || responseData.length === 0) {
        messageDiv.textContent = "No transaction data found.";
        messageDiv.style.color = "red";
        return;
      }
      const transaction = responseData[0];
  
      const currency = transaction.currency || "N/A";
      const amount = transaction.amount || "N/A";
      const description = transaction.description || "No description available";

      const messageText = `
        Recieved transaction:
        ID: ${transaction.id}
        Currency: ${currency}
        Amount: ${amount / 100} ${currency}
        Description: ${description}
      `;
  
      messageDiv.innerHTML = messageText.replace(/\n/g, "<br>");
      messageDiv.style.color = "blue";

    const data = {
      server_uri: apiUrl,
      verifier_address: "81.219.135.164:30079",
      headers: headersList,
      max_sent_data: 4096,
      max_recv_data: 16384,
    };

    // send to background script
    chrome.runtime.sendMessage({
      type: "nativeMessage",
      data: data
    }, response => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        messageDiv.textContent = "Error sending to native app";
        messageDiv.style.color = "red";
        return;
      }
      if (response.status === "error") {
        messageDiv.textContent = response.message || "Error in native app";
        messageDiv.style.color = "red";
        return;
      }
      console.log(response);
      // messageDiv.textContent = "Sent to native app!";
      // messageDiv.style.color = "green";

      // Clear logs after sending message
      const logContainer = document.getElementById("logContainer");
      logContainer.innerHTML = '';
    });

  } catch (err) {
    console.error('Error:', err);
    messageDiv.textContent = "Failed to send to native app.";
    messageDiv.style.color = "red";
    logContainer.innerHTML = '';
  }
};

const messageListener = (message) => {
  if (message.type === "nativeResponse") {
    const logContainer = document.getElementById("logContainer");

    if (message.data.type === "Logging") {
      logContainer.textContent = `Status: ${message.data.message.logging}`;

      if (message.data.message.logging === "Prover done successfully") {
        logContainer.style.color = "green";
      } else {
        logContainer.style.color = "orange";
      }

      console.log("Logging:", message.data.message.logging);
    }
  }
};

chrome.runtime.onMessage.addListener(messageListener);

window.addEventListener('unload', () => {
  chrome.runtime.onMessage.removeListener(messageListener);
});

document.addEventListener("DOMContentLoaded", function () {
  // const curlButton = document.getElementById("curl");
  // const proveButton = document.getElementById("prove");
  const nativeButton = document.getElementById("native");

  // curlButton.addEventListener("click", curlButtonListener);
  // proveButton.addEventListener("click", proveButtonListener);
  nativeButton.addEventListener("click", nativeButtonListener);

  // Add log container dynamically
  const logContainer = document.createElement('div');
  logContainer.id = 'logContainer';
  document.body.appendChild(logContainer);
});
