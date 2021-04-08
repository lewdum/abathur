// Too limited for the vast amounts of tab data...
// const storage = browser.storage.sync

const storage = browser.storage.local

const elemSessionList = document.querySelector('#session-list')
const elemSessionLabel = document.querySelector('#session-label')
const elemSessionTable = document.querySelector('#session-table')

const elemSaveIcons = document.querySelector('#save-icons')
const elemSaveSession = document.querySelector('#save-session')

const elemDownloadSession = document.querySelector('#download-session')
const elemDeleteSession = document.querySelector('#delete-session')

const elemKeepTop = document.querySelector('#keep-top')
const elemKeepBottom = document.querySelector('#keep-bottom')
const elemKeepPinned = document.querySelector('#keep-pinned')
const elemKillTabs = document.querySelector('#kill-tabs')

const elemUsage = document.querySelector('#memory-usage')

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
    if (!confirm('Esta operação é irreversível. Deseja continuar?')) {
        return
    }

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

    console.log("CLOSING")
    console.log(ids)

    await browser.tabs.remove(ids)

    console.log("CLOSED")
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

    elemDeleteSession.addEventListener('click',
        async () => {
            await deleteSession()
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

    // TODO: Slow as FUCK, but getBytesInUse() is bugged.
    // const used = JSON.stringify(stateSessions).length

    // const capacity = 5 * 10 ** 6
    // const percent = Math.floor(100 * used / capacity)

    // elemUsage.textContent = `${used}/${capacity} bytes (${percent}%)`

    await updateTable()
}

document.addEventListener('DOMContentLoaded', loaded)
