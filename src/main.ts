import { BN } from 'bn.js'

const IPFS_GATEWAY = 'https://ipfs.moonicorn.network/ipfs/'

const defaultOpts = {
	marketURL: 'https://market.moonicorn.network',
	acceptedStates: ['Active', 'Ready'],
	minPerImpression: '1',
	minTargetingScore: 0,
	topByPrice: 10,
	topByScore: 5,
	randomize: true,
}

interface TargetTag {
	tag: string,
	score: number
}

type BigNumStr = string
interface AdViewManagerOptions {
	// Defaulted via defaultOpts
	marketURL: string,
	acceptedStates: Array<string>,
	minPerImpression: BigNumStr,
	minTargetingScore: number,
	randomize: boolean,
	// Must be passed (except the ones with ?)
	publisherAddr: string,
	whitelistedToken: string,
	whitelistedType?: string,
	topByPrice?: number,
	topByScore?: number,
	targeting?: Array<TargetTag>,
	width?: number,
	height?: number,
	fallbackUnit?: string
}

function calculateTargetScore(a: Array<TargetTag>, b: Array<TargetTag>): number {
	return a.map(x => {
		const match = b.find(y => y.tag === x.tag)
		if (match) {
			return x.score * match.score
		}
		return 0
	}).reduce((a, b) => a + b, 0)
}

function applySelection(campaigns: Array<any>, options: AdViewManagerOptions): Array<any> {
	const eligible = campaigns.filter(campaign => {
		return options.acceptedStates.includes(campaign.status.name)
			&& (campaign.spec.activeFrom || 0) < Date.now()
			&& Array.isArray(campaign.spec.adUnits)
			&& campaign.depositAsset === options.whitelistedToken
			&& new BN(campaign.spec.minPerImpression)
				.gte(new BN(options.minPerImpression))
	})

	// Map them to units, flatten
	const units = eligible
		.map(campaign =>
			campaign.spec.adUnits.map(unit => ({
				unit,
				channelId: campaign.id,
				validators: campaign.spec.validators,
				minTargetingScore: unit.minTargetingScore || campaign.spec.minTargetingScore || 0,
				minPerImpression: campaign.spec.minPerImpression,
			}))
		)
		.reduce((a, b) => a.concat(b), [])

	const unitsByPrice = units
		.sort((b, a) => new BN(a.minPerImpression).cmp(new BN(b.minPerImpression)))

	const unitsTop = options.topByPrice
		? unitsByPrice.slice(0, options.topByPrice)
		: unitsByPrice

	const unitsTopFiltered = options.whitelistedType
		? unitsTop.filter(x => x.unit.type === options.whitelistedType)
		: unitsTop

	const unitsByScore = unitsTopFiltered
		.map(x => ({
			...x,
			targetingScore: calculateTargetScore(x.unit.targeting, options.targeting || []),
		}))
		.filter(x =>
			x.targetingScore >= options.minTargetingScore
			&& x.targetingScore >= x.minTargetingScore
		)
		.sort((a, b) => b.targetingScore - a.targetingScore)

	const unitsTopByScore = options.topByScore
		? unitsByScore.slice(0, options.topByScore)
		: unitsByScore

	return unitsByScore
}

export function normalizeUrl(url: string): string {
	if (url.startsWith('ipfs://')) return `${IPFS_GATEWAY}${url.slice(7)}`
	return url
}

function imageHtml({ evBody, onLoadCode, size, imgUrl }): string {
	return `<img src="${imgUrl}" data-event-body='${evBody}' alt="AdEx ad" rel="nofollow" onload="${onLoadCode}" ${size}>`
}

function videoHtml({ evBody, onLoadCode, size, imgUrl, mediaMime }): string {
	return `<video ${size} loop autoplay data-event-body='${evBody}' onloadeddata="${onLoadCode}" muted>` +
		`<source src="${imgUrl}" type="${mediaMime}">` +
		`</video>`
}

function adexIcon(): string {
	return `<a href="https://www.moonicorn.network" target="_blank" rel="noopener noreferrer"
			style="position: absolute; top: 0; right: 0;"
		>`
		+ `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="18px"
			height="18px" viewBox="0 0 18 18" style="enable-background:new 0 0 18 18;" xml:space="preserve">
			<style type="text/css">
				.st0{fill:#FFFFFF;}
				.st1{fill:#1B75BC;}
			</style>
			<defs>
			</defs>
			<rect class="st0" width="18" height="18"/>
			<path class="st1" d="M14,12.1L10.9,9L14,5.9L12.1,4L9,7.1L5.9,4L4,5.9L7.1,9L4,12.1L5.9,14L9,10.9l3.1,3.1L14,12.1z M7.9,2L6.4,3.5
				L7.9,5L9,3.9L10.1,5l1.5-1.5L10,1.9l-1-1L7.9,2 M7.9,16l-1.5-1.5L7.9,13L9,14.1l1.1-1.1l1.5,1.5L10,16.1l-1,1L7.9,16"/>
   			</svg>`
		+ `</a>`
}

function getUnitHTML({ width, height }: AdViewManagerOptions, { unit, evBody = '', onLoadCode = '' }): string {
	const imgUrl = normalizeUrl(unit.mediaUrl)
	const isVideo = (unit.mediaMime || '').split('/')[0] === 'video'
	const size = width && height ? `width="${width}" height="${height}" ` : ''
	return `<div
			style="position: relative; overflow: hidden; ${size ? `width: ${width}px; height: ${height}px;` : ''}"
		>`
		+ `<a href="${unit.targetUrl}" target="_blank" rel="noopener noreferrer">`
		+ (isVideo
			? videoHtml({ evBody, onLoadCode, size, imgUrl, mediaMime: unit.mediaMime })
			: imageHtml({ evBody, onLoadCode, size, imgUrl }))
		+ `</a>`
		+ adexIcon()
		+ `</div>`
}

function getHTML(options: AdViewManagerOptions, { unit, channelId, validators }): string {
	const evBody = JSON.stringify({ events: [{ type: 'IMPRESSION', publisher: options.publisherAddr, adUnit: unit.ipfs }] })
	const onLoadCode = validators
		.map(({ url }) => {
			const fetchOpts = `{ method: 'POST', headers: { 'content-type': 'application/json' }, body: this.dataset.eventBody }`
			const fetchUrl = `${url}/channel/${channelId}/events`
			return `fetch('${fetchUrl}', ${fetchOpts})`
		})
		.join(';')

	return getUnitHTML(options, { unit, evBody, onLoadCode })
}

export class AdViewManager {
	private fetch: any
	private options: AdViewManagerOptions
	private timesShown: { [key: string]: number }
	private getTimesShown(channelId: string): number {
		return this.timesShown[channelId] || 0
	}
	constructor(fetch, opts: AdViewManagerOptions) {
		this.fetch = fetch
		this.options = { ...defaultOpts, ...opts }
		this.timesShown = {}
	}
	async getAdUnits(): Promise<any> {
		const url = `${this.options.marketURL}/campaigns?status=${this.options.acceptedStates.join(',')}`
		const campaigns = await this.fetch(url).then(r => r.json())
		return applySelection(campaigns, this.options)
	}
	async getFallbackUnit(): Promise<any> {
		const { fallbackUnit } = this.options
		if (!fallbackUnit) return null
		const url = `${this.options.marketURL}/units/${this.options.fallbackUnit}`
		const result = await this.fetch(url).then(r => r.json())
		return result.unit
	}
	async getNextAdUnit(): Promise<any> {
		const units = await this.getAdUnits()
		if (units.length === 0) {
			const fallbackUnit = await this.getFallbackUnit()
			if (fallbackUnit) {
				return { ...fallbackUnit, html: getUnitHTML(this.options, { unit: fallbackUnit }) }
			} else {
				return null
			}
		}

		const min = units
			.map(({ channelId }) => this.getTimesShown(channelId))
			.reduce((a, b) => Math.min(a, b))
		const leastShownUnits = units
			.filter(({ channelId }) => this.getTimesShown(channelId) === min)
		const next = this.options.randomize ?
			leastShownUnits[Math.floor(Math.random() * leastShownUnits.length)]
			: leastShownUnits[0]
		this.timesShown[next.channelId] = this.getTimesShown(next.channelId) + 1
		return { ...next, html: getHTML(this.options, next) }
	}
}
