;(function () {
  const SERVICE_WORKER_URL = window.location.origin + '/pay/sw-interledger.js'
  // Adds the BobPay default instrument.
  function addInstruments (registration) {
    registration.paymentManager.userHint = 'test@interledgerpay.xyz'
    return Promise.all([
      registration.paymentManager.instruments.set(
        '5c077d7a-0a4a-4a08-986a-7fb0f5b08b13',
        {
          name: 'Ripple via ILP',
          icons: [{
            src: '/pay/images/ilp_icon.png',
            sizes: '32x32',
            type: 'image/png'}
          ],
          method: 'interledger'
        }),
      registration.paymentManager.instruments.set(
        'new-card',
        {
          name: 'Add a new card to BobPay',
          method: 'basic-card',
          capabilities: {
            supportedNetworks: ['visa', 'mastercard', 'amex', 'discover'],
            supportedTypes: ['credit', 'debit', 'prepaid']
          }
        })
    ])
  };

  function registerPaymentAppServiceWorker () {
    navigator.serviceWorker.register(SERVICE_WORKER_URL).then(function (registration) {
      if (!registration.paymentManager) {
        registration.unregister().then((success) => {})
        console.log('Payment app capability not present. Enable flags?')
        return
      }
      addInstruments(registration).then(function () {
        console.log('Successfully registered!')
        showBobPayStatus(true)
      })
    }).catch((error) => {
      console.log('Service worker registration error', error)
    })
  }
  // Registers the payment app service worker by installing the default
  // instruments.
  function unregisterPaymentAppServiceWorker () {
    navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL).then(function (registration) {
      registration.unregister().then((success) => {
        console.log('Successfully unregistered!')
        showBobPayStatus(false)
      })
    })
  }

  navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL).then(function (registration) {
    if (registration) {
      // BobPay service worker is installed.
      if (registration.paymentManager) {
        // Always update the installed service worker.
        showBobPayStatus(true)
        registration.update()
      } else {
        // Not supposed to have a BobPay service worker if there is no
        // paymentManager available (feature is now off?). Remove the
        // service worker.
        unregisterPaymentAppServiceWorker()
      }
    }
  })
  function showBobPayStatus (enabled) {
    var buttonText = enabled ?
      'Enabled' : 'Enable Web Payments'
    var id = enabled ?
      'enable-webpayments' : 'webpayments-enabled'
    const webPaymentButton = document.getElementById(id)
    webPaymentButton.onclick = function () {
      return false
    }
    webPaymentButton.id = enabled ?
      'webpayments-enabled' : 'enable-webpayments'
    webPaymentButton.innerHTML = buttonText
    if (enabled) {
      webPaymentButton.onclick = () => {
        unregisterPaymentAppServiceWorker()
      }
    } else {
      webPaymentButton.onclick = () => {
        registerPaymentAppServiceWorker()
      }
    }
  }

  const enableWebPayments = document.getElementById('enable-webpayments')
  const unregisterWebPayment = document.getElementById('webpayments-enabled')
  if (enableWebPayments) {
    enableWebPayments.onclick = () => {
      registerPaymentAppServiceWorker()
    }
  }
  if (unregisterWebPayment) {
    unregisterWebPayment.onclick = () => {
      unregisterPaymentAppServiceWorker()
    }
  }
  function getWhitelistItemTemplate(cursor) {
    const uniqueId = `display-item-${cursor.id}`
    return `<div class="row item-row" id="${uniqueId}">
              <div class="col-md-4 domain">
                <p><a href=${cursor.domain}>${cursor.domain}</a></p>
              </div>
              <div class="col-md-2 currency">
                <p> ${cursor.currency} </p>
              </div>
              <div class="col-md-2 value">
                <p> ${cursor.capAmount} </p>
              </div>
              <div class="col-md-1 edit">
                <button class="btn btn-success">
                  Edit
                </button>
              </div>
              <div class="col-md-1 remove">
                <button class="btn btn-danger">
                  Remove
                </button>
              </div>
    </div>`
  };

  function removeFromWhitelist (domain, uniqueId) {
    const listItem = document.querySelector(`#display-item-${uniqueId}`)
    if (!window.indexedDB) {
      console.log('This browser does\'t support IndexedDB')
    } else {
      let request = window.indexedDB.open('walletConfig', 2)
      request.onerror = function (event) {
        console.log('Database error: ' + event.target.errorCode)
      }
      // No upgrade needed
      request.onsuccess = function () {
        const db = request.result
        const transaction = db.transaction(['whitelist'], 'readwrite')
        const objStore = transaction.objectStore('whitelist')
        const index = objStore.index('domain')
        const item = index.get(domain)
        if (item) {
          // Remove item from IndexedDB
          const removeRequest = objStore.delete(uniqueId)
          removeRequest.onsuccess = function (event) {
            // Should log undefined
            console.log('Successfully removed', index.get(domain))
            listItem.style.display = 'none'
          }
        }
        transaction.oncomplete = function () {
          db.close()
        }
      }
    }
  };

  function displayWhitelist () {
    // Gather entries of everything in white list. Allow users to remove and change max payment.
    if (!window.indexedDB) {
      console.log('This browser doesn\'t support IndexedDB')
    } else {
      let request = window.indexedDB.open('walletConfig', 2)
      request.onerror = function (event) {
        console.log('Database error: ' + event.target.errorCode)
      }

      request.onupgradeneeded = function () {
        let db = request.result
        if (!db.objectStoreNames.contains('whitelist')) {
          let store = db.createObjectStore('whitelist', {keyPath: 'id', autoIncrement: true})
          let index = store.createIndex('domain', 'domain', { unique: true })
        }
      }

      request.onsuccess = function () {
        const domainContainer = document.querySelector('#whitelist-items')
        let db = request.result
        let transaction = db.transaction(['whitelist'], 'readwrite')
        let objStore = transaction.objectStore('whitelist')
        objStore.openCursor().onsuccess = function (event) {
          let cursor = event.target.result
          if (cursor) {
            const templateString = getWhitelistItemTemplate(cursor.value)
            const item = document.createElement('div')
            item.innerHTML = templateString
            domainContainer.appendChild(item)
            const removeElement = document.querySelector(`#display-item-${cursor.value.id} .remove button`)
            removeElement.onclick = function () {
              removeFromWhitelist(cursor.value.domain, cursor.value.id)
            }
            cursor.continue()
          } else {
            console.log('all entries finished')
          }
        }
      }
    }
  }
  displayWhitelist()
})()
