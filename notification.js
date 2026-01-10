import {dom} from './dom.js'

// --------------------------
// Utility #dom #notification 
// --------------------------
export let notificationpopup = (msg, error = false) => {
	msg = error ? '🚫 ' +msg : msg
	let tag = '.notification' + (error ? '.error' : '')

	let d = dom(tag, msg)

	document.querySelectorAll('.notification')
		.forEach((e) => {
			let b = parseFloat(e.style.bottom)
			e.style.bottom = (b + 5) + 'em'
		})

	document.body.appendChild(d)

	setTimeout(() => { d.style.right = '1em'; d.style.opacity = 1 }, 5)
	setTimeout(() => { d.style.opacity = 0 }, error ? 6000 : 4500)
	setTimeout(() => { d.remove() }, error ? 9500 : 8000)
}
