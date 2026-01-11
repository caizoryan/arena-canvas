let stringify = JSON.stringify
export let createStore = (internal) => {
	let undo = []
	let redo = []

	let canUndo = () => undo.length > 0
	let canRedo = () => redo.length > 0

	let doUndo = () => {
		let old = tracking
		tracking = 'redo'
		let action = undo.pop()
		console.log("ACTION", action)
		if (action) apply(...action)
		tracking = old
	}

	let doRedo = () => {
		let old = tracking
		tracking = 'undo'
		let action = redo.pop()
		console.log("Redoing", action)
		if (action) apply(...action)
		tracking = old
	}

	let batch = []

	let recordInverse = (action) => {
		if (tracking == 'undo') undo.push(action)
		else if (tracking == 'redo') redo.push(action)
		else if (tracking == 'batch') batch.push(action) 
	}

	let startBatch = () => {
		lastTracking = tracking
		tracking = 'batch'
	}

	let endBatch = () => {
		tracking = lastTracking
		recordInverse(['batch', batch])
		batch = []
	}

	let relocate = (from, to, fn) => {
		let f = subscriptions.get(stringify(from))
		let i = -1
		if (f) f.findIndex(e => e == fn)
		if (i != i) f.splice(i, 1)

		return subscribe(to, fn)
	}

	let tracking = 'undo'
	let lastTracking = tracking

	let pauseTracking = () => tracking = 'paused'
	let resumeTracking = () => tracking = 'undo'

	let subscriptions = new Map()
	let apply = (location, action, value, track = true) => {
		if (!track) pauseTracking()

		if (typeof location == 'string' && location == 'batch') {
			startBatch()
			action.forEach(act => apply(...act))
			endBatch()
			return
		}

		let ref = getref(location, internal)
		if (action == 'push') {
			ref.push(value)
			recordInverse([[...location], 'pop'])
		}
		else if (action == 'pop') {
			let removed = ref.pop()
			recordInverse([[...location], 'push', removed])
		}
		else if (action == 'insert') {
			ref.splice(value[0], 0, value[1])
			recordInverse([[...location], 'remove', [value[0], 1]])
		}
		else if (action == 'set') {
			let old = ref[value[0]]
			ref[value[0]] = value[1]

			let loc = location.concat([value[0]])
			let subscribers = subscriptions.get(stringify(loc))
			if (subscribers) {subscribers.forEach(fn => fn(ref))}

			recordInverse([[...location], 'set', [value[0], old]])
		}
		else if (action == 'log') {
			console.log(ref)
		}
		else if (action == 'remove') {
			// TODO: Make also work for objects (delete property)
			let [removed] = ref.splice(value[0], value[1])
			recordInverse([[...location], 'insert', [value[0], removed]])
		}

		// somehow make this nestable?
		// ['key', 'another'] subscription
		// should also notify ['key'] subscription
		// should notify parent basically
		let subscribers = subscriptions.get(stringify(location))
		if (subscribers) {subscribers.forEach(fn => fn(ref))}

		if (!track) resumeTracking()
	}

	let get = location => getref(location, internal)
	let subscribe = (location, fn) => {
		// somehow make this nestable?
		// ['key', 'another'] subscription
		// should also notify ['key'] subscription
		// should notify parent basically
		let key = stringify(location)
		let is = subscriptions.get(key)
		if (is) is.push(fn)
		else subscriptions.set(key, [fn])
		return () => {
			let fns = subscriptions.get(key)
			let index = fns.find(e => e == fn)
			if (index!=-1) fns.splice(index, 1)
		}
	}

	let getref = (address, arr) => {
		let copy = [...address]
		let index = copy.shift()
		if (copy.length == 0) return arr[index]
		return getref(copy, arr[index])
	}
	return {apply, tr: apply, get, subscribe,
					startBatch, endBatch,
					doUndo, canUndo, doRedo, canRedo, pauseTracking, resumeTracking, relocate}
}
