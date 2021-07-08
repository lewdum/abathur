// Too limited for the vast amounts of tab data...
// const storage = browser.storage.sync

const storage = browser.storage.local

const elemSessionList = document.querySelector('#session-list')
const elemSessionLabel = document.querySelector('#session-label')
const elemSessionTable = document.querySelector('#session-table')

const elemSaveIcons = document.querySelector('#save-icons')
const elemSaveSession = document.querySelector('#save-session')

const elemOpenWindowSession = document.querySelector('#open-session')
const elemDownloadSession = document.querySelector('#download-session')
const elemDeleteSession = document.querySelector('#delete-session')
const elemRetrieveIcons = document.querySelector('#retrieve-icons')

const elemKeepTop = document.querySelector('#keep-top')
const elemKeepBottom = document.querySelector('#keep-bottom')
const elemKeepPinned = document.querySelector('#keep-pinned')
const elemKillTabs = document.querySelector('#kill-tabs')

const elemStatus = document.querySelector('#status')

const controls = [
    elemSessionList,
    elemSaveIcons,
    elemSaveSession,
    elemDownloadSession,
    elemOpenWindowSession,
    elemDeleteSession,
    elemRetrieveIcons,
    elemKeepTop,
    elemKeepBottom,
    elemKeepPinned,
    elemKillTabs,
]


// Tarefas simultâneas em retrieveIcons.
const concurrentWorkers = 10

let stateSessions = []


function refreshPage() {
    document.location = document.location
}

function getSessionName(session) {
    const stamp = session.date.toISOString()
    const safe = stamp.replaceAll('T', ' ').replaceAll(':', '-')
    return `Abathur - Sessão de ${safe} - Janela ${session.window}`
}

function getSelectedIndex() {
    if (elemSessionList.value === '') {
        return
    }
    return Number(elemSessionList.value)
}

function getSelectedSession() {
    const index = getSelectedIndex()
    if (index === undefined) {
        return
    }
    return stateSessions[index]
}

async function getOption(name, fallback) {
    const value = (await storage.get(name))[name]
    return value !== undefined ? value : fallback
}

async function setOption(name, value, fallback) {
    if (value === fallback) {
        await storage.remove(name)
    } else {
        await storage.set({ [name]: value })
    }

    browser.runtime.sendMessage('updateSettings')
}

async function loadState() {
    stateSessions = await getOption('sessions', [])
}

async function saveState() {
    await setOption('sessions', stateSessions)
}

async function saveTabs() {
    const includeIcons = elemSaveIcons.checked

    const tabs = await browser.tabs.query({
        currentWindow: true,
    })

    const windowId = tabs[0].windowId

    const now = new Date()

    const compact = tabs.map(tab => {
        return {
            id: tab.id,
            pinned: tab.pinned || undefined,
            opener: tab.openerTabId,
            icon: includeIcons ? tab.favIconUrl : undefined,
            title: tab.title,
            url: tab.url,
        }
    })

    const state = {
        date: now,
        window: windowId,
        count: compact.length,
        tabs: compact,
    }

    stateSessions.splice(0, 0, state)

    await saveState()

    refreshPage()

    // const text = JSON.stringify(compact, null, 4)
}

async function updateTable() {
    const session = getSelectedSession()

    if (session === undefined) {
        return
    }

    console.log('Removing old children...')

    while (elemSessionTable.children.length > 1) {
        elemSessionTable.removeChild(elemSessionTable.lastChild)
    }

    console.log('Adding new children...')

    for (const tab of session.tabs) {
        const row = document.createElement('tr')

        function column(value) {
            const col = document.createElement('td')
            col.append(value)
            row.appendChild(col)
        }

        function icon(test, src, useTitle) {
            const ico = document.createElement('img')
            ico.className = 'icon'
            if (test && src != null) {
                ico.src = src
                if (useTitle) {
                    ico.title = src
                }
            }
            return ico
        }

        function link(title, url) {
            const link = document.createElement('a')
            link.textContent = title
            link.href = url
            return link
        }

        column(tab.id)
        column(icon(tab.pinned, "icons/pin-angle.svg"))
        column(icon(true, tab.icon, true))
        column(link(tab.title, tab.url))

        elemSessionTable.appendChild(row)
    }

    console.log('Refresh completed.')

    elemSessionLabel.textContent = `Lista de abas (${session.tabs.length}):`
}

async function retrieveIcons() {
    const session = getSelectedSession()

    if (session === undefined) {
        return
    }

    // if (!confirm(
    //     'Isto usa um serviço do Google para obter os ícones. ' +
    //     'O Google pode rastrear você. Deseja continuar?'
    // )) {
    //     return
    // }
    //
    // https://www.google.com/s2/favicons?domain=???

    if (!confirm(
        'Os ícones obtidos desta forma podem ocupar mais espaço do que o normal. ' +
        'Ademais, esta operação pode levar algum tempo, dependendo do tamanho da sessão. ' +
        'Solicitações serão feitas para todos os servidores na lista. ' +
        'Deseja continuar?'
    )) {
        return
    }

    setStatus('Preparando para obter ícones...')

    disableControls()

    let busy = []

    let total = session.tabs.length
    let successes = 0
    let failures = 0

    async function waitNextTask() {
        const result = await busy[0]
        let done = successes + failures
        const row = elemSessionTable.children[done + 1]

        if (result) {
            successes++
        } else {
            failures++

            const col = row.children[2]
            col.removeChild(col.firstChild)
        }

        busy.splice(0, 1)
        row.scrollIntoView()

        done++
        const percent = Math.floor(100 * done / total)
        setStatus(`Executando operação... ${done}/${total} (${percent}%)`)
    }

    for (let i = 0; i < total; i++) {
        const tab = session.tabs[i]
        const url = tab.url

        if (busy.length === concurrentWorkers) {
            await waitNextTask()
        }

        const row = elemSessionTable.children[i + 1]
        const col = row.children[2]

        if (col.firstChild === undefined) {
            col.appendChild(document.createElement('img'))
        }

        const icon = col.firstChild

        busy.push(retrieveIcon(icon, url))
    }

    while (busy.length > 0) {
        await waitNextTask()
    }

    setStatus(`Operação concluída. Ícones obtidos com sucesso: ${successes}/${total}.`)

    enableControls()
}

async function retrieveIcon(icon, url) {
    // TODO: Must check if loading failed previously...
    // if (icon.src) {
    //     return
    // }

    function setIconAndWait(url) {
        const promise = new Promise(
            (resolve, reject) => {
                buffer.onload = resolve
                buffer.onerror = reject
            })

        buffer.title = url
        buffer.src = url

        return promise
    }

    icon.title = 'Carregando...'
    icon.src = 'icons/arrow-clockwise-gray.svg'

    const buffer = document.createElement('img')
    buffer.style.visibility = 'hidden'

    const components = url.split('/', 3)
    const baseURL = components.join('/')
    const iconURL = `${baseURL}/favicon.ico`

    try {
        await setIconAndWait(iconURL)
    } catch (err) {
        try {
            const response = await fetch(iconURL)
            const data = await response.blob()
            const dataURL = URL.createObjectURL(data) // TODO: destroy these eventually

            await setIconAndWait(dataURL)
        } catch (err) {
            return false
        }
    }

    icon.title = buffer.title
    icon.src = buffer.src

    return true
}

async function downloadText() {
    const session = getSelectedSession()

    if (session === undefined) {
        return
    }

    const text = JSON.stringify(session, null, 4)

    const blob = new Blob([text], {
        type: 'application/json',
    })

    const url = URL.createObjectURL(blob)

    await browser.downloads.download({
        filename: `${getSessionName(session)}.json`,
        saveAs: true,
        url,
    })

    // URL.revokeObjectURL(url)
}

async function openNewWindow() {
    const session = getSelectedSession()

    if (session === undefined) {
        return
    }

    // FIXME: Must prevent these from even being saved in the first place.
    const urls = session.tabs
        .filter(tab => !tab.url.startsWith('moz-extension:'))
        .filter(tab => !tab.url.startsWith('about:'))
        .map(tab => tab.url)

    // FIXME: Can we create the tabs in a suspended state?
    await browser.windows.create({
        url: urls,
    })
}

async function deleteSession() {
    const index = getSelectedIndex()
    if (index === undefined) {
        return
    }
    if (!confirm('Esta operação é irreversível. Deseja continuar?')) {
        return
    }
    stateSessions.splice(index, 1)
    await saveState()
    refreshPage()
}

async function killTabs() {
    if (!confirm(
        'Esta operação é irreversível. ' +
        'Fechar muitas abas pode demorar bastante tempo. ' +
        'Deseja continuar?'
    )) {
        return
    }

    setStatus('Fechando abas... Por favor, mantenha esta página aberta.')

    disableControls()

    const keepCountTop = Number(elemKeepTop.value)
    const keepCountBottom = Number(elemKeepBottom.value)
    const keepPinned = elemKeepPinned.checked

    const tabs = await browser.tabs.query({
        currentWindow: true,

        pinned: keepPinned ? false : undefined,
    })

    tabs.sort((a, b) => a.index - b.index)

    tabs.splice(0, keepCountTop)
    tabs.splice(tabs.length - keepCountBottom, keepCountBottom)

    const ids = tabs.map(tab => tab.id)

    await browser.tabs.remove(ids)

    setStatus(`Operação concluída. Abas fechadas com sucesso: ${ids.length}.`)

    enableControls()
}

function enableControls() {
    for (const control of controls) {
        control.disabled = false
    }
}

function disableControls() {
    for (const control of controls) {
        control.disabled = true
    }
}

function setStatus(text) {
    elemStatus.textContent = text
}

async function loaded() {
    await loadState()

    elemSessionList.addEventListener('change',
        async () => {
            await updateTable()
        })

    elemSaveSession.addEventListener('click',
        async () => {
            await saveTabs()
        })

    elemDownloadSession.addEventListener('click',
        async () => {
            await downloadText()
        })

    elemOpenWindowSession.addEventListener('click',
        async () => {
            await openNewWindow()
        })

    elemDeleteSession.addEventListener('click',
        async () => {
            await deleteSession()
        })

    elemRetrieveIcons.addEventListener('click',
        async () => {
            await retrieveIcons()
        })

    elemKillTabs.addEventListener('click',
        async () => {
            await killTabs()
        })

    stateSessions.forEach((session, index) => {
        const name = getSessionName(session)

        const option = document.createElement('option')
        option.setAttribute('value', index)
        option.textContent = name

        elemSessionList.appendChild(option)
    })

    enableControls()

    await updateTable()
}

document.addEventListener('DOMContentLoaded', loaded)
