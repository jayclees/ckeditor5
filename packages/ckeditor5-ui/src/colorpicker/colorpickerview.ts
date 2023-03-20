/**
 * @license Copyright (c) 2003-2023, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module ui/colorpicker/colorpickerview
 */

import View from '../view';
import { type Locale, global } from '@ckeditor/ckeditor5-utils';
import 'vanilla-colorful';
import 'vanilla-colorful/hex-input.js';

export default class ColorPickerView extends View {
	/**
	 * color picker
	 */
	declare private _picker: HTMLElement;

	/**
	 * color picker input
	 */
	declare private _input: HTMLElement;

	constructor( locale: Locale | undefined ) {
		super( locale );

		this.setTemplate( {
			tag: 'div',
			attributes: {
				class: [ 'ck', 'ck-color-picker' ]
			}
		} );
	}

	public setColor( color: string | undefined ): void {
		if ( color ) {
			this._picker.setAttribute( 'color', color );
		}
	}

	public focus(): void {
		this._picker.focus();
	}

	public override render(): void {
		super.render();

		this._picker = global.document.createElement( 'hex-color-picker' );
		this._input = global.document.createElement( 'hex-input' );
		this._picker.setAttribute( 'color', '#ffffff' );

		if ( this.element ) {
			this.element.appendChild( this._picker );
			this.element.appendChild( this._input );
		}

		this._picker.addEventListener( 'color-changed', event => {
			const customEvent = event as CustomEvent;
			this.fire( 'change', { value: customEvent.detail.value } );
		} );

		this._input.addEventListener( 'color-changed', event => {
			const customEvent = event as CustomEvent;
			const color = customEvent.detail.value || '#ffffff';

			this.setColor( color );
			this.fire( 'change', { value: color } );
		} );
	}
}

type CustomEvent = Event & {
	detail: {
		value: string;
	};
};