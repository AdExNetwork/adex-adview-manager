const path = require('path')
const SriPlugin = require('webpack-subresource-integrity')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
	entry: { main: './main-browser.js', moon: './moon.js' },
	output: {
		filename: `[name].js?t=${Date.now()}`,
		path: path.resolve(__dirname, 'dist.browser'),
		crossOriginLoading: 'anonymous'
	},
	plugins: [
		new HtmlWebpackPlugin({
			templateParameters: {
				title: 'AdEx Adview'
			},
			chunks: ['main'],
			template: 'index.ejs',
			filename: 'index.html'
		}),
		new HtmlWebpackPlugin({
			templateParameters: {
				title: 'Example JS import & div-s'
			},
			chunks: ['moon'],
			template: 'js-example.ejs',
			filename: 'js-example.html'
		}),
		new SriPlugin({
			hashFuncNames: ['sha256', 'sha384'],
			enabled: true
		})
	]
}
