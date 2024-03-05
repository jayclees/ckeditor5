/**
 * @license Copyright (c) 2003-2024, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/* globals setTimeout, window, console, document */

import EditorWatchdog from '../src/editorwatchdog.js';
import MultiRootEditor from '@ckeditor/ckeditor5-editor-multi-root/src/multirooteditor.js';
import ClassicTestEditor from '@ckeditor/ckeditor5-core/tests/_utils/classictesteditor.js';
import CKEditorError from '@ckeditor/ckeditor5-utils/src/ckeditorerror.js';
import Paragraph from '@ckeditor/ckeditor5-paragraph/src/paragraph.js';
import Clipboard from '@ckeditor/ckeditor5-clipboard/src/clipboard.js';
import { Comments } from '@ckeditor/ckeditor5-comments';
import { TrackChanges } from '@ckeditor/ckeditor5-track-changes';
import Suggestion from '@ckeditor/ckeditor5-track-changes/src/suggestion.js';

class UsersInit {
	static get requires() {
		return [ 'Users' ];
	}

	constructor( editor ) {
		this.editor = editor;
	}

	init() {
		const users = this.editor.plugins.get( 'Users' );

		users.addUser( {
			id: 'u1',
			name: 'John Smith'
		} );

		users.addUser( {
			id: 'u2',
			name: 'Kate Jones'
		} );

		users.defineMe( 'u1' );
	}
}

// The error handling testing with mocha & chai is quite broken and hard to test.
// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
//
describe( 'EditorWatchdog', () => {
	let element;

	beforeEach( () => {
		element = document.createElement( 'div' );
		document.body.appendChild( element );
	} );

	afterEach( () => {
		element.remove();
		sinon.restore();
	} );

	describe( 'create()', () => {
		it( 'should create an editor instance', async () => {
			const watchdog = new EditorWatchdog();

			const editorCreateSpy = sinon.spy( ClassicTestEditor, 'create' );
			const editorDestroySpy = sinon.spy( ClassicTestEditor.prototype, 'destroy' );

			watchdog.setCreator( ( el, config ) => ClassicTestEditor.create( el, config ) );

			await watchdog.create( element, {} );

			sinon.assert.calledOnce( editorCreateSpy );
			sinon.assert.notCalled( editorDestroySpy );

			await watchdog.destroy();

			sinon.assert.calledOnce( editorCreateSpy );
			sinon.assert.calledOnce( editorDestroySpy );
		} );

		it( 'should properly copy the config', async () => {
			const watchdog = new EditorWatchdog();
			watchdog.setCreator( ( el, config ) => ClassicTestEditor.create( el, config ) );

			const config = {
				foo: [],
				bar: document.createElement( 'div' )
			};

			await watchdog.create( element, config );

			expect( watchdog.editor.config._config.foo ).to.not.equal( config.foo );
			expect( watchdog.editor.config._config.bar ).to.equal( config.bar );

			await watchdog.destroy();
		} );

		it( 'should support editor data passed as the first argument', async () => {
			const watchdog = new EditorWatchdog();

			watchdog.setCreator( ( data, config ) => ClassicTestEditor.create( data, config ) );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			const windowErrorSpy = sinon.spy();
			window.onerror = windowErrorSpy;

			await watchdog.create( '<p>foo</p>', { plugins: [ Paragraph ] } );

			expect( watchdog.editor.getData() ).to.equal( '<p>foo</p>' );

			await new Promise( res => {
				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				watchdog.on( 'restart', () => {
					window.onerror = originalErrorHandler;
					res();
				} );
			} );

			expect( watchdog.editor.getData() ).to.equal( '<p>foo</p>' );

			// Watchdog should set data in a non-undoable batch to prevent the undo feature from reverting to empty editor.
			expect( watchdog.editor.model.document.history.getOperation( 0 ).batch.isUndoable ).to.be.false;

			await watchdog.destroy();
		} );

		it( 'should support root attributes', async () => {
			const watchdog = new EditorWatchdog();

			watchdog.setCreator( ( data, config ) => ClassicTestEditor.create( data, config ) );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			const windowErrorSpy = sinon.spy();
			window.onerror = windowErrorSpy;

			await watchdog.create( '<p>foo</p>', { plugins: [ Paragraph ] } );

			const root = watchdog.editor.model.document.getRoot();

			watchdog.editor.model.change( writer => {
				writer.setAttribute( 'test', 1, root );
			} );

			expect( root.getAttribute( 'test' ) ).to.equal( 1 );

			await new Promise( res => {
				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				watchdog.on( 'restart', () => {
					window.onerror = originalErrorHandler;
					res();
				} );
			} );

			expect( root.getAttribute( 'test' ) ).to.equal( 1 );

			await watchdog.destroy();
		} );

		it( 'should support markers', async () => {
			const watchdog = new EditorWatchdog();

			watchdog.setCreator( ( data, config ) => ClassicTestEditor.create( data, config ) );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			const windowErrorSpy = sinon.spy();
			window.onerror = windowErrorSpy;

			await watchdog.create( '<p>foo</p>', { plugins: [ Paragraph ] } );

			const root = watchdog.editor.model.document.getRoot();

			watchdog.editor.model.change( writer => {
				writer.addMarker( 'first', {
					usingOperation: false,
					affectsData: false,
					range: writer.createRange(
						writer.createPositionAt( root, [ 0 ] ),
						writer.createPositionAt( root, [ 1 ] )
					)
				} );

				writer.addMarker( 'second', {
					usingOperation: true,
					affectsData: true,
					range: writer.createRange(
						writer.createPositionAt( root, [ 0 ] ),
						writer.createPositionAt( root, [ 1 ] )
					)
				} );
			} );

			const marker = watchdog.editor.model.markers.get( 'second' );

			watchdog._save();

			await new Promise( res => {
				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				watchdog.on( 'restart', () => {
					window.onerror = originalErrorHandler;
					res();
				} );
			} );

			expect( watchdog.editor.model.markers.get( 'first' ) ).to.be.null;
			expect( watchdog.editor.model.markers.get( 'second' ).name ).to.equal( marker.name );

			await watchdog.destroy();
		} );

		it( 'should create an editor instance after destroying the previous one', async () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			await watchdog.create( element, {
				initialData: '<p>foo</p>',
				plugins: [ Paragraph ]
			} );

			// Do not wait for the destruction process to finish.
			watchdog.destroy();

			await watchdog.create( element, {
				initialData: '<p>foo</p>',
				plugins: [ Paragraph ]
			} );

			expect( watchdog.editor ).to.not.be.null;
			expect( watchdog.state ).to.equal( 'ready' );

			await watchdog.destroy();
		} );
	} );

	describe( 'editor', () => {
		it( 'should be the current editor instance', () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			const windowErrorSpy = sinon.spy();
			window.onerror = windowErrorSpy;

			expect( watchdog.editor ).to.be.null;

			let oldEditor;

			return watchdog.create( element, {} )
				.then( () => {
					oldEditor = watchdog.editor;
					expect( watchdog.editor ).to.be.instanceOf( ClassicTestEditor );

					return new Promise( res => {
						setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

						watchdog.on( 'restart', () => {
							window.onerror = originalErrorHandler;
							res();
						} );
					} );
				} )
				.then( () => {
					expect( watchdog.editor ).to.be.instanceOf( ClassicTestEditor );
					expect( watchdog.editor ).to.not.equal( oldEditor );

					return watchdog.destroy();
				} )
				.then( () => {
					expect( watchdog.editor ).to.be.null;
				} );
		} );
	} );

	describe( 'collaboration data', () => {
		let watchdog;

		beforeEach( async () => {
			watchdog = new EditorWatchdog();

			watchdog.setCreator( ( data, config ) => ClassicTestEditor.create( data, config ) );
		} );

		afterEach( async () => {
			await watchdog.destroy();
		} );

		it( 'should support comment threads', async () => {
			await watchdog.create( '<p>Foo bar</p>', {
				plugins: [ Paragraph, UsersInit, Comments, TrackChanges, Clipboard ],
				licenseKey: 'uI0zfya2yTle649FSKlQCRsBSez+W4Vh5reIiKp0uDVYRCuPjaPYlf8=',
				comments: {
					editorConfig: {}
				}
			} );

			const originalErrorHandler = window.onerror;
			const windowErrorSpy = sinon.spy();
			window.onerror = windowErrorSpy;

			const commentsRepository = watchdog.editor.plugins.get( 'CommentsRepository' );

			commentsRepository.addCommentThread( { threadId: 't1', target: () => null } );

			watchdog.editor.setData(
				'<p>' +
				'Fo' +
				'<comment id="t1" type="start"></comment>' +
				'o b' +
				'<comment id="t1" type="end"></comment>' +
				'ar' +
				'</p>'
			);

			expect( watchdog.editor.getData() ).to.equal(
				'<p>Fo<comment-start name="t1"></comment-start>o b<comment-end name="t1"></comment-end>ar</p>'
			);

			await new Promise( res => {
				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				watchdog.on( 'restart', () => {
					window.onerror = originalErrorHandler;
					res();
				} );
			} );

			expect( watchdog.editor.getData() ).to.equal(
				'<p>Fo<comment-start name="t1"></comment-start>o b<comment-end name="t1"></comment-end>ar</p>'
			);
			expect( watchdog.editor.plugins.get( 'CommentsRepository' ).getCommentThread( 't1' ) ).to.be.not.null;
		} );

		it( 'should support suggestions', async () => {
			await watchdog.create( '<p>Foo bar</p>', {
				plugins: [ Paragraph, UsersInit, Comments, TrackChanges, Clipboard ],
				licenseKey: 'uI0zfya2yTle649FSKlQCRsBSez+W4Vh5reIiKp0uDVYRCuPjaPYlf8=',
				comments: {
					editorConfig: {}
				}
			} );

			const originalErrorHandler = window.onerror;
			const windowErrorSpy = sinon.spy();
			window.onerror = windowErrorSpy;

			sinon.stub( Suggestion, 'getMultiRangeId' ).callsFake( () => 'test' );

			const trackChangesEditing = watchdog.editor.plugins.get( 'TrackChangesEditing' );

			watchdog.editor.model.change( writer => {
				const suggestion = trackChangesEditing.addSuggestionData( {
					id: '1',
					type: 'insertion:subType',
					authorId: 'u1',
					data: null,
					createdAt: new Date(),
					attributes: {}
				} );

				const root = watchdog.editor.model.document.getRoot();

				const startPos = writer.createPositionFromPath( root, [ 0, 0 ] );
				const endPos = writer.createPositionFromPath( root, [ 0, 3 ] );
				const range = writer.createRange( startPos, endPos );

				suggestion.addRange( range );
			} );

			expect( watchdog.editor.getData() ).to.equal(
				'<p>' +
				'<suggestion-start name="insertion:subType:1:u1:test"></suggestion-start' +
				'>Foo<' +
				'suggestion-end name="insertion:subType:1:u1:test"></suggestion-end> ' +
				'bar</p>'
			);

			await new Promise( res => {
				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				watchdog.on( 'restart', () => {
					window.onerror = originalErrorHandler;
					res();
				} );
			} );

			expect( watchdog.editor.getData() ).to.equal(
				'<p>' +
				'<suggestion-start name="insertion:subType:1:u1:test"></suggestion-start' +
				'>Foo<' +
				'suggestion-end name="insertion:subType:1:u1:test"></suggestion-end> ' +
				'bar</p>'
			);
		} );

		it( 'should support comment data created by another plugins', async () => {
			// Plugin that creates comment thread on init.
			class InitPlugin {
				constructor( editor ) {
					this.editor = editor;
				}

				init() {
					const commentsRepository = this.editor.plugins.get( 'CommentsRepository' );

					commentsRepository.addCommentThread( { threadId: 't1', target: () => null } );
				}
			}

			await watchdog.create( '<p>Foo bar</p>', {
				plugins: [ Paragraph, UsersInit, Comments, Clipboard, TrackChanges, InitPlugin ],
				licenseKey: 'uI0zfya2yTle649FSKlQCRsBSez+W4Vh5reIiKp0uDVYRCuPjaPYlf8=',
				comments: {
					editorConfig: {}
				}
			} );

			const originalErrorHandler = window.onerror;
			const windowErrorSpy = sinon.spy();
			window.onerror = windowErrorSpy;

			watchdog.editor.setData(
				'<p>' +
				'Fo' +
				'<comment id="t1" type="start"></comment>' +
				'o b' +
				'<comment id="t1" type="end"></comment>' +
				'ar' +
				'</p>'
			);

			// Set comment thread attributes to test if it will be restored after restart.
			const commentThread = watchdog.editor.plugins.get( 'CommentsRepository' ).getCommentThread( 't1' );
			commentThread.setAttribute( 'test', 'value' );

			watchdog._save();

			await new Promise( res => {
				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				watchdog.on( 'restart', () => {
					window.onerror = originalErrorHandler;
					res();
				} );
			} );

			// Should keep the comment thread up to date even if the InitPlugin creates the new instance.
			expect( watchdog.editor.plugins.get( 'CommentsRepository' ).getCommentThread( 't1' ).attributes ).to.deep.equal( {
				test: 'value'
			} );
		} );

		it( 'should support suggestion data created by another plugins', async () => {
			sinon.stub( Suggestion, 'getMultiRangeId' ).callsFake( () => 'test' );

			// Plugin that creates suggestion on init.
			class InitPlugin {
				constructor( editor ) {
					this.editor = editor;
				}

				init() {
					const trackChangesEditing = this.editor.plugins.get( 'TrackChangesEditing' );

					trackChangesEditing.addSuggestionData( {
						id: '1',
						type: 'insertion:subType',
						authorId: 'u1',
						data: null,
						createdAt: new Date(),
						attributes: {}
					} );
				}
			}

			await watchdog.create( '<p>Foo bar</p>', {
				plugins: [ Paragraph, UsersInit, Comments, Clipboard, TrackChanges, InitPlugin ],
				licenseKey: 'uI0zfya2yTle649FSKlQCRsBSez+W4Vh5reIiKp0uDVYRCuPjaPYlf8=',
				comments: {
					editorConfig: {}
				}
			} );

			const originalErrorHandler = window.onerror;
			const windowErrorSpy = sinon.spy();
			window.onerror = windowErrorSpy;

			// Set comment thread attributes to test if it will be restored after restart.
			const suggestion = watchdog.editor.plugins.get( 'TrackChangesEditing' ).getSuggestion( '1' );

			watchdog.editor.model.change( writer => {
				const root = watchdog.editor.model.document.getRoot();

				const startPos = writer.createPositionFromPath( root, [ 0, 0 ] );
				const endPos = writer.createPositionFromPath( root, [ 0, 3 ] );
				const range = writer.createRange( startPos, endPos );

				suggestion.addRange( range );
			} );

			// Set suggestion attributes to test if it will be restored after restart.
			suggestion.setAttribute( 'test', 'value' );

			watchdog._save();

			await new Promise( res => {
				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				watchdog.on( 'restart', () => {
					window.onerror = originalErrorHandler;
					res();
				} );
			} );

			expect( watchdog.editor.getData() ).to.equal(
				'<p>' +
				'<suggestion-start name="insertion:subType:1:u1:test"></suggestion-start' +
				'>Foo<' +
				'suggestion-end name="insertion:subType:1:u1:test"></suggestion-end> ' +
				'bar</p>'
			);

			// Should keep the suggestion attributes up to date even if the InitPlugin creates the new instance.
			expect( watchdog.editor.plugins.get( 'TrackChangesEditing' ).getSuggestion( '1' ).attributes ).to.deep.equal( {
				test: 'value'
			} );
		} );
	} );

	describe( 'error handling', () => {
		it( 'Watchdog should not restart editor during the initialization', () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );
			let editor;

			watchdog.setCreator( async el => {
				editor = await ClassicTestEditor.create( el );
				await Promise.reject( new Error( 'foo' ) );
			} );

			return watchdog.create( element ).then(
				() => { throw new Error( '`watchdog.create()` should throw an error.' ); },
				err => {
					expect( err ).to.be.instanceOf( Error );
					expect( err.message ).to.equal( 'foo' );

					return editor.destroy();
				}
			);
		} );

		it( 'Watchdog should not restart editor during the destroy', async () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			watchdog.setDestructor( () => Promise.reject( new Error( 'foo' ) ) );

			await watchdog.create( element );

			let caughtError = false;
			const editor = watchdog.editor;

			try {
				await watchdog.destroy();
			} catch ( err ) {
				caughtError = true;
				expect( err ).to.be.instanceOf( Error );
				expect( err.message ).to.equal( 'foo' );

				await editor.destroy();
			}

			if ( !caughtError ) {
				throw new Error( '`watchdog.create()` should throw an error.' );
			}
		} );

		it( 'Watchdog should not hide intercepted errors', () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			const windowErrorSpy = sinon.spy();
			window.onerror = windowErrorSpy;

			return watchdog.create( element ).then( () => {
				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				return new Promise( res => {
					watchdog.on( 'restart', () => {
						window.onerror = originalErrorHandler;

						sinon.assert.calledOnce( windowErrorSpy );

						// Various browsers will display the error slightly differently.
						expect( windowErrorSpy.getCall( 0 ).args[ 0 ] ).to.match( /foo/ );

						watchdog.destroy().then( res );
					} );
				} );
			} );
		} );

		it( 'Watchdog should intercept editor errors and restart the editor during the runtime', () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			return watchdog.create( element ).then( () => {
				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				return new Promise( res => {
					watchdog.on( 'restart', () => {
						window.onerror = originalErrorHandler;

						watchdog.destroy().then( res );
					} );
				} );
			} );
		} );

		it( 'Watchdog should not intercept non-editor errors', () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			const editorErrorSpy = sinon.spy();
			watchdog.on( 'error', editorErrorSpy );

			const watchdogErrorHandlerSpy = sinon.spy( watchdog, '_handleError' );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			return watchdog.create( element ).then( () => {
				const error = new Error( 'foo' );

				setTimeout( () => {
					throw error;
				} );

				setTimeout( () => {
					throw 'bar';
				} );

				setTimeout( () => {
					throw null;
				} );

				return new Promise( res => {
					setTimeout( () => {
						window.onerror = originalErrorHandler;

						sinon.assert.notCalled( editorErrorSpy );

						// Assert that only instances of the `Error` class will be checked deeper.
						sinon.assert.calledOnce( watchdogErrorHandlerSpy );
						expect( watchdogErrorHandlerSpy.getCall( 0 ).args[ 0 ] ).to.equal( error );

						watchdog.destroy().then( res );
					} );
				} );
			} );
		} );

		it( 'Watchdog should not intercept other editor errors', () => {
			const watchdog1 = new EditorWatchdog( ClassicTestEditor );
			const watchdog2 = new EditorWatchdog( ClassicTestEditor );

			const config = {
				plugins: []
			};

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			return Promise.all( [
				watchdog1.create( element, config ),
				watchdog2.create( element, config )
			] ).then( () => {
				return new Promise( res => {
					const watchdog1ErrorSpy = sinon.spy();
					const watchdog2ErrorSpy = sinon.spy();

					watchdog1.on( 'restart', watchdog1ErrorSpy );
					watchdog2.on( 'restart', watchdog2ErrorSpy );

					setTimeout( () => throwCKEditorError( 'foo', watchdog2.editor ) );

					setTimeout( () => {
						window.onerror = originalErrorHandler;

						sinon.assert.notCalled( watchdog1ErrorSpy );
						sinon.assert.calledOnce( watchdog2ErrorSpy );

						Promise.all( [ watchdog1.destroy(), watchdog2.destroy() ] )
							.then( res );
					} );
				} );
			} );
		} );

		it( 'Watchdog should intercept editor errors and restart the editor if the editor can be found from the context', async () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			await watchdog.create( element );

			setTimeout( () => throwCKEditorError( 'foo', watchdog.editor.model.document ) );

			await new Promise( res => {
				watchdog.on( 'restart', () => {
					window.onerror = originalErrorHandler;

					watchdog.destroy().then( res );
				} );
			} );
		} );

		it( 'Watchdog should intercept editor errors and restart the editor if the editor can be found from the context #2', async () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			await watchdog.create( element );

			setTimeout( () => throwCKEditorError( 'foo', {
				foo: [ 1, 2, 3, {
					bar: new Set( [
						new Map( /** @type any */( [
							[ 'foo', 'bar' ],
							[ 0, watchdog.editor ]
						] ) )
					] )
				} ]
			} ) );

			await new Promise( res => {
				watchdog.on( 'restart', () => {
					window.onerror = originalErrorHandler;

					watchdog.destroy().then( res );
				} );
			} );
		} );

		it( 'Watchdog should crash permanently if the `crashNumberLimit` is reached' +
			' and the average time between errors is lower than `minimumNonErrorTimePeriod` (default values)', async () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			const errorSpy = sinon.spy();
			watchdog.on( 'error', errorSpy );

			const restartSpy = sinon.spy();
			watchdog.on( 'restart', restartSpy );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			await watchdog.create( element );

			setTimeout( () => throwCKEditorError( 'foo1', watchdog.editor ) );
			setTimeout( () => throwCKEditorError( 'foo2', watchdog.editor ) );
			setTimeout( () => throwCKEditorError( 'foo3', watchdog.editor ) );
			setTimeout( () => throwCKEditorError( 'foo4', watchdog.editor ) );

			await waitCycle();

			expect( errorSpy.callCount ).to.equal( 4 );
			expect( watchdog.crashes.length ).to.equal( 4 );
			expect( restartSpy.callCount ).to.equal( 3 );

			window.onerror = originalErrorHandler;

			await watchdog.destroy();
		} );

		it( 'Watchdog should crash permanently if the `crashNumberLimit` is reached' +
			' and the average time between errors is lower than `minimumNonErrorTimePeriod` (custom values)', async () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor, { crashNumberLimit: 2, minimumNonErrorTimePeriod: 1000 } );

			const errorSpy = sinon.spy();
			watchdog.on( 'error', errorSpy );

			const restartSpy = sinon.spy();
			watchdog.on( 'restart', restartSpy );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			await watchdog.create( element );

			setTimeout( () => throwCKEditorError( 'foo1', watchdog.editor ) );
			setTimeout( () => throwCKEditorError( 'foo2', watchdog.editor ) );
			setTimeout( () => throwCKEditorError( 'foo3', watchdog.editor ) );
			setTimeout( () => throwCKEditorError( 'foo4', watchdog.editor ) );

			await waitCycle();

			expect( errorSpy.callCount ).to.equal( 3 );
			expect( watchdog.crashes.length ).to.equal( 3 );
			expect( restartSpy.callCount ).to.equal( 2 );

			window.onerror = originalErrorHandler;

			await watchdog.destroy();
		} );

		it( 'Watchdog should not crash permanently when average time between errors' +
			' is longer than `minimumNonErrorTimePeriod`', async () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor, { crashNumberLimit: 2, minimumNonErrorTimePeriod: 0 } );

			const errorSpy = sinon.spy();
			watchdog.on( 'error', errorSpy );

			const restartSpy = sinon.spy();
			watchdog.on( 'restart', restartSpy );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			await watchdog.create( element );

			setTimeout( () => throwCKEditorError( 'foo1', watchdog.editor ), 5 );
			setTimeout( () => throwCKEditorError( 'foo2', watchdog.editor ), 10 );
			setTimeout( () => throwCKEditorError( 'foo3', watchdog.editor ), 15 );
			setTimeout( () => throwCKEditorError( 'foo4', watchdog.editor ), 20 );

			await new Promise( res => {
				setTimeout( res, 20 );
			} );

			expect( errorSpy.callCount ).to.equal( 4 );
			expect( watchdog.crashes.length ).to.equal( 4 );
			expect( restartSpy.callCount ).to.equal( 4 );

			window.onerror = originalErrorHandler;

			await watchdog.destroy();
		} );

		it.skip( 'Watchdog should warn if the CKEditorError is missing its context', async () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			sinon.stub( console, 'warn' );

			await watchdog.create( element );

			setTimeout( () => throwCKEditorError( 'foo' ) );

			await waitCycle();

			window.onerror = originalErrorHandler;

			expect( watchdog.crashes ).to.deep.equal( [] );

			sinon.assert.calledWithExactly(
				console.warn,
				'The error is missing its context and Watchdog cannot restart the proper item.'
			);

			await watchdog.destroy();
		} );

		it( 'Watchdog should omit error if the CKEditorError context is equal to null', async () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			await watchdog.create( element );

			setTimeout( () => throwCKEditorError( 'foo', null ) );

			await waitCycle();

			window.onerror = originalErrorHandler;

			expect( watchdog.crashes ).to.deep.equal( [] );

			await watchdog.destroy();
		} );

		it( 'editor should be restarted with the data from before the crash #1', () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			return watchdog.create( element, {
				initialData: '<p>foo</p>',
				plugins: [ Paragraph ]
			} ).then( () => {
				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				return new Promise( res => {
					watchdog.on( 'restart', () => {
						window.onerror = originalErrorHandler;

						expect( watchdog.editor.getData() ).to.equal( '<p>foo</p>' );

						watchdog.destroy().then( res );
					} );
				} );
			} );
		} );

		it( 'editor should be restarted with the data before the crash #2', () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			return watchdog.create( element, {
				initialData: '<p>foo</p>',
				plugins: [ Paragraph ]
			} ).then( () => {
				const doc = watchdog.editor.model.document;

				watchdog.editor.model.change( writer => {
					writer.insertText( 'bar', writer.createPositionAt( doc.getRoot(), 1 ) );
				} );

				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				return new Promise( res => {
					watchdog.on( 'restart', () => {
						window.onerror = originalErrorHandler;

						expect( watchdog.editor.getData() ).to.equal( '<p>foo</p>bar' );

						watchdog.destroy().then( res );
					} );
				} );
			} );
		} );

		it( 'editor should be restarted with the data of the latest document version before the crash', async () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = sinon.spy();

			await watchdog.create( element, {
				initialData: '<p>foo</p>',
				plugins: [ Paragraph ]
			} );

			const model = watchdog.editor.model;
			const doc = model.document;

			const watchdogRestartPromise = new Promise( res => {
				watchdog.on( 'restart', () => {
					window.onerror = originalErrorHandler;

					res();
				} );
			} );

			// Throw an error inside the change() block.
			// The watchdog should be then restarted from the state before this change block.
			setTimeout( () => {
				model.change( writer => {
					writer.insertText( 'bar', writer.createPositionAt( doc.getRoot(), 1 ) );

					throwCKEditorError( 'foo', watchdog.editor );
				} );
			} );

			await watchdogRestartPromise;

			expect( watchdog.editor.getData() ).to.equal( '<p>foo</p>' );

			await watchdog.destroy();
		} );

		it( 'editor should be restarted with the latest available data before the crash', async () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			sinon.stub( console, 'error' );

			await watchdog.create( element, {
				initialData: '<p>foo</p>',
				plugins: [ Paragraph ]
			} );

			const editorGetDataError = new Error( 'Some error' );
			const getDataStub = sinon.stub( watchdog, '_getData' )
				.onCall( 0 ).throwsException( editorGetDataError )
				.onCall( 1 ).returns( {} );
			// Keep the reference to cleanly destroy it at in the end, as during the TC it
			// throws an exception during destruction.
			const firstEditor = watchdog.editor;

			await new Promise( res => {
				const doc = watchdog.editor.model.document;

				watchdog.editor.model.change( writer => {
					writer.insertText( 'bar', writer.createPositionAt( doc.getRoot(), 1 ) );
				} );

				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				watchdog.on( 'restart', async () => {
					window.onerror = originalErrorHandler;

					// It is called second time by during the default editor destruction
					// to update the source element.
					sinon.assert.calledTwice( getDataStub );

					expect( watchdog.editor.getData() ).to.equal( '<p>foo</p>' );

					sinon.assert.calledWith(
						console.error,
						editorGetDataError,
						'An error happened during restoring editor data. Editor will be restored from the previously saved data.'
					);

					await watchdog.destroy();

					getDataStub.restore();

					await firstEditor.destroy();

					res();
				} );
			} );
		} );

		it( 'should use the custom destructor if passed', () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );
			const destructionSpy = sinon.spy();

			watchdog.setDestructor( editor => {
				destructionSpy();
				return editor.destroy();
			} );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			return watchdog.create( element ).then( () => {
				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				return new Promise( res => {
					watchdog.on( 'restart', () => {
						window.onerror = originalErrorHandler;

						sinon.assert.calledOnce( destructionSpy );

						watchdog.destroy().then( res );
					} );
				} );
			} );
		} );

		it( 'should handle the error when the editor destroying failed', async () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			sinon.stub( console, 'error' );

			await watchdog.create( element, {
				initialData: '<p>foo</p>',
				plugins: [ Paragraph ]
			} );

			const editorGetDataError = new Error( 'Some error' );
			const destroyStub = sinon.stub( watchdog, '_destroy' )
				.throwsException( editorGetDataError );

			// Keep the reference to cleanly destroy it at in the end, as during the TC it
			// throws an exception during destruction.
			const firstEditor = watchdog.editor;

			await new Promise( res => {
				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				watchdog.on( 'restart', async () => {
					window.onerror = originalErrorHandler;

					sinon.assert.calledWith(
						console.error,
						'An error happened during the editor destroying.'
					);

					destroyStub.restore();

					await watchdog.destroy();
					await firstEditor.destroy();

					res();
				} );
			} );
		} );
	} );

	describe( 'async error handling', () => {
		let unhandledRejectionEventSupported;

		before( () => {
			return isUnhandledRejectionEventSupported()
				.then( val => {
					unhandledRejectionEventSupported = val;
				} );
		} );

		it( 'Watchdog should handle async CKEditorError errors', () => {
			if ( !unhandledRejectionEventSupported ) {
				return;
			}

			const watchdog = new EditorWatchdog( ClassicTestEditor );
			const originalErrorHandler = window.onerror;

			window.onerror = undefined;

			return watchdog.create( element, {
				initialData: '<p>foo</p>',
				plugins: [ Paragraph ]
			} ).then( () => {
				const oldEditor = watchdog.editor;

				Promise.resolve().then( () => throwCKEditorError( 'foo', watchdog.editor ) );

				return new Promise( res => {
					watchdog.on( 'restart', () => {
						window.onerror = originalErrorHandler;

						expect( watchdog.editor ).to.not.equal( oldEditor );
						expect( watchdog.editor.getData() ).to.equal( '<p>foo</p>' );

						watchdog.destroy().then( res );
					} );
				} );
			} );
		} );

		it( 'Watchdog should not react to non-editor async errors', () => {
			if ( !unhandledRejectionEventSupported ) {
				return;
			}

			const watchdog = new EditorWatchdog( ClassicTestEditor );
			const originalErrorHandler = window.onerror;
			const editorErrorSpy = sinon.spy();

			window.onerror = undefined;

			return watchdog.create( element, {
				initialData: '<p>foo</p>',
				plugins: [ Paragraph ]
			} ).then( () => {
				watchdog.on( 'error', editorErrorSpy );

				Promise.resolve().then( () => Promise.reject( 'foo' ) );
				Promise.resolve().then( () => Promise.reject( new Error( 'bar' ) ) );

				// Wait a cycle.
				return new Promise( res => setTimeout( res ) );
			} ).then( () => {
				window.onerror = originalErrorHandler;

				sinon.assert.notCalled( editorErrorSpy );
				expect( watchdog.editor.getData() ).to.equal( '<p>foo</p>' );

				return watchdog.destroy();
			} );
		} );
	} );

	describe( 'destroying', () => {
		// See https://github.com/ckeditor/ckeditor5/issues/4706.
		it( 'destroy() should clean internal stuff', () => {
			// 30ms should be enough to make the two data changes split into two data save actions.
			// This will ensure that the second data save action will be put off in time.
			const SAVE_INTERVAL = 30;

			const watchdog = new EditorWatchdog( ClassicTestEditor, {
				saveInterval: SAVE_INTERVAL
			} );

			return watchdog.create( element, {
				initialData: '<p>foo</p>',
				plugins: [ Paragraph ]
			} ).then( () => {
				const doc = watchdog.editor.model.document;

				watchdog.editor.model.change( writer => {
					writer.insertText( 'bar', writer.createPositionAt( doc.getRoot(), 1 ) );
				} );

				watchdog.editor.model.change( writer => {
					writer.insertText( 'foo', writer.createPositionAt( doc.getRoot(), 1 ) );
				} );

				return watchdog.destroy();
			} ).then( () => {
				// Wait to ensure that the throttled save is cleared and won't be executed
				// on the non-existing editor.
				return new Promise( res => setTimeout( res, SAVE_INTERVAL ) );
			} ).then( () => {
				expect( watchdog.editor ).to.equal( null );
				expect( watchdog.state ).to.equal( 'destroyed' );
				expect( watchdog.crashes ).to.deep.equal( [] );
			} );
		} );

		// See https://github.com/ckeditor/ckeditor5/issues/10643.
		it( 'watchdog should remove the listener for `change:data` event before destroying the editor', async () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			const spy = sinon.spy();

			// A plugin that modifies the editor data during the destruction phase.
			class InvalidPlugin {
				constructor( editor ) {
					this.editor = editor;
				}

				destroy() {
					const doc = this.editor.model.document;

					this.editor.model.change( writer => {
						writer.insertText( 'bar', writer.createPositionAt( doc.getRoot(), 1 ) );
						spy();
					} );
				}
			}

			await watchdog.create( element, {
				initialData: '<p>foo</p>',
				plugins: [ InvalidPlugin, Paragraph ]
			} );

			await watchdog._restart();

			// The watchdog during destroying the editor should not listen to the data changes.
			sinon.assert.calledOnce( spy );
			expect( watchdog.editor.getData() ).to.equal( '<p>foo</p>' );

			await watchdog.destroy();

			sinon.assert.calledTwice( spy );
		} );

		it( 'should destroy the editor after finishing initialization', async () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			// Do not wait for the creation process to finish.
			watchdog.create( element, {
				initialData: '<p>foo</p>',
				plugins: [ Paragraph ]
			} );

			await watchdog.destroy();

			expect( watchdog.editor ).to.equal( null );
			expect( watchdog.state ).to.equal( 'destroyed' );
		} );
	} );

	describe( 'crashes', () => {
		it( 'should be an array of caught errors by the watchdog', () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			return watchdog.create( element ).then( () => {
				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );
				setTimeout( () => throwCKEditorError( 'bar', watchdog.editor ) );

				return new Promise( res => {
					setTimeout( () => {
						window.onerror = originalErrorHandler;

						expect( watchdog.crashes[ 0 ].message ).to.match( /^foo/ );
						expect( watchdog.crashes[ 0 ].stack ).to.be.a( 'string' );
						expect( watchdog.crashes[ 0 ].date ).to.be.a( 'number' );
						expect( watchdog.crashes[ 0 ].filename ).to.be.a( 'string' );
						expect( watchdog.crashes[ 0 ].lineno ).to.be.a( 'number' );
						expect( watchdog.crashes[ 0 ].colno ).to.be.a( 'number' );

						expect( watchdog.crashes[ 1 ].message ).to.match( /^bar/ );

						watchdog.destroy().then( res );
					} );
				} );
			} );
		} );

		it( 'should include async errors', () => {
			return isUnhandledRejectionEventSupported().then( isSupported => {
				if ( !isSupported ) {
					return;
				}

				const watchdog = new EditorWatchdog( ClassicTestEditor );

				// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
				const originalErrorHandler = window.onerror;
				window.onerror = undefined;

				return watchdog.create( element ).then( () => {
					Promise.resolve().then( () => throwCKEditorError( 'foo', watchdog.editor ) );

					return new Promise( res => {
						// This `setTimeout` needs to have a timer defined because Firefox calls the code in random order
						// and causes the test failed.
						setTimeout( () => {
							window.onerror = originalErrorHandler;

							expect( watchdog.crashes[ 0 ].message ).to.match( /^foo/ );
							expect( watchdog.crashes[ 0 ].stack ).to.be.a( 'string' );
							expect( watchdog.crashes[ 0 ].date ).to.be.a( 'number' );
							expect( watchdog.crashes[ 0 ].filename ).to.be.an( 'undefined' );
							expect( watchdog.crashes[ 0 ].lineno ).to.be.an( 'undefined' );
							expect( watchdog.crashes[ 0 ].colno ).to.be.an( 'undefined' );

							watchdog.destroy().then( res );
						}, 10 );
					} );
				} );
			} );
		} );
	} );

	describe( 'state', () => {
		it( 'should reflect the state of the watchdog', async () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );

			// sinon.stub( window, 'onerror' ).value( undefined ); and similar do not work.
			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			expect( watchdog.state ).to.equal( 'initializing' );

			await watchdog.create( element );

			expect( watchdog.state ).to.equal( 'ready' );

			setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );
			setTimeout( () => throwCKEditorError( 'bar', watchdog.editor ) );

			await waitCycle();

			window.onerror = originalErrorHandler;

			expect( watchdog.state ).to.equal( 'ready' );

			await watchdog.destroy();

			expect( watchdog.state ).to.equal( 'destroyed' );
		} );

		it( 'should be observable', async () => {
			const watchdog = new EditorWatchdog( ClassicTestEditor );
			const states = [];

			watchdog.on( 'stateChange', () => {
				states.push( watchdog.state );
			} );

			const originalErrorHandler = window.onerror;
			window.onerror = undefined;

			await watchdog.create( element );

			setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );
			setTimeout( () => throwCKEditorError( 'bar', watchdog.editor ) );
			setTimeout( () => throwCKEditorError( 'baz', watchdog.editor ) );
			setTimeout( () => throwCKEditorError( 'biz', watchdog.editor ) );

			await waitCycle();

			window.onerror = originalErrorHandler;

			await watchdog.destroy();

			expect( states ).to.deep.equal( [
				'ready',
				'crashed',
				'initializing',
				'ready',
				'crashed',
				'initializing',
				'ready',
				'crashed',
				'initializing',
				'ready',
				'crashed',
				'crashedPermanently',
				'destroyed'
			] );
		} );
	} );

	describe( 'multi-root editor', () => {
		let element2, watchdog, originalErrorHandler, restartSpy;

		beforeEach( () => {
			element2 = document.createElement( 'div' );
			document.body.appendChild( element2 );

			watchdog = new EditorWatchdog( MultiRootEditor );

			restartSpy = sinon.spy();

			originalErrorHandler = window.onerror;
			window.onerror = undefined;
		} );

		afterEach( async () => {
			element2.remove();

			window.onerror = originalErrorHandler;

			await watchdog.destroy();
		} );

		describe( 'init using data', () => {
			let clock;

			beforeEach( async () => {
				await watchdog.create( {
					header: '<p>Foo</p>',
					content: '<p>Bar</p>'
				}, {
					plugins: [ Paragraph ],
					rootsAttributes: {
						header: {
							order: 1
						},
						content: {
							order: 2
						}
					},
					lazyRoots: [ 'lazyOne', 'lazyTwo' ]
				} );

				watchdog.on( 'restart', restartSpy );
			} );

			it( 'should properly restart', async () => {
				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				await waitCycle();

				sinon.assert.calledOnce( restartSpy );

				expect( watchdog.editor.getFullData() ).to.deep.equal( {
					header: '<p>Foo</p>',
					content: '<p>Bar</p>'
				} );

				expect( watchdog.editor.getRootsAttributes() ).to.deep.equal( {
					header: { order: 1 },
					content: { order: 2 }
				} );
			} );

			it( 'should properly handle added and removed roots', async () => {
				clock = sinon.useFakeTimers();

				watchdog.editor.detachRoot( 'content' );
				watchdog.editor.addRoot( 'new', { data: '<p>New</p>', attributes: { order: 3 } } );

				clock.tick( 6000 );
				clock.restore();

				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				await waitCycle();

				sinon.assert.calledOnce( restartSpy );

				expect( watchdog.editor.getFullData() ).to.deep.equal( {
					header: '<p>Foo</p>',
					new: '<p>New</p>'
				} );

				expect( watchdog.editor.getRootsAttributes() ).to.deep.equal( {
					header: { order: 1 },
					new: { order: 3 }
				} );
			} );

			it( 'should properly handle lazy roots', async () => {
				clock = sinon.useFakeTimers();

				watchdog.editor.detachRoot( 'lazyOne' );
				watchdog.editor.loadRoot( 'lazyTwo', { data: '<p>Two</p>', attributes: { order: 5 } } );

				clock.tick( 6000 );
				clock.restore();

				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				await waitCycle();

				sinon.assert.calledOnce( restartSpy );

				expect( watchdog.editor.getFullData() ).to.deep.equal( {
					header: '<p>Foo</p>',
					content: '<p>Bar</p>',
					lazyTwo: '<p>Two</p>'
				} );

				expect( watchdog.editor.getRootsAttributes() ).to.deep.equal( {
					header: { order: 1 },
					content: { order: 2 },
					lazyTwo: { order: 5 }
				} );
			} );
		} );

		describe( 'init using elements', () => {
			let clock;

			beforeEach( async () => {
				class MultiRootEditorIntegration {
					constructor( editor ) {
						this.editor = editor;
					}

					init() {
						this.editor.on( 'addRoot', ( evt, root ) => {
							const domElement = this.editor.createEditable( root );

							document.body.appendChild( domElement );
						} );

						this.editor.on( 'detachRoot', ( evt, root ) => {
							const domElement = this.editor.detachEditable( root );

							domElement.remove();
						} );
					}
				}

				watchdog.setDestructor( editor => {
					for ( const name of editor.ui.getEditableElementsNames() ) {
						const editable = editor.ui.getEditableElement( name );

						editable.remove();
					}

					return editor.destroy();
				} );

				await watchdog.create( {
					header: element,
					content: element2
				}, {
					initialData: {
						header: '<p>Foo</p>',
						content: '<p>Bar</p>'
					},
					plugins: [ Paragraph, MultiRootEditorIntegration ],
					rootsAttributes: {
						header: {
							order: 1
						},
						content: {
							order: 2
						}
					},
					lazyRoots: [ 'lazyOne', 'lazyTwo' ]
				} );

				watchdog.on( 'restart', restartSpy );
			} );

			it( 'should properly restart', async () => {
				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				await waitCycle();

				window.onerror = originalErrorHandler;

				sinon.assert.calledOnce( restartSpy );

				expect( watchdog.editor.data.get( { rootName: 'header' } ) ).to.equal( '<p>Foo</p>' );
				expect( watchdog.editor.data.get( { rootName: 'content' } ) ).to.equal( '<p>Bar</p>' );
			} );

			it( 'should properly handle added and removed roots', async () => {
				clock = sinon.useFakeTimers();

				watchdog.editor.detachRoot( 'content' );
				watchdog.editor.addRoot( 'new', { data: '<p>New</p>', attributes: { order: 3 } } );

				clock.tick( 6000 );
				clock.restore();

				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				await waitCycle();

				sinon.assert.calledOnce( restartSpy );

				expect( watchdog.editor.getFullData() ).to.deep.equal( {
					header: '<p>Foo</p>',
					new: '<p>New</p>'
				} );

				expect( watchdog.editor.getRootsAttributes() ).to.deep.equal( {
					header: { order: 1 },
					new: { order: 3 }
				} );
			} );

			it( 'should properly handle lazy roots', async () => {
				clock = sinon.useFakeTimers();

				watchdog.editor.detachRoot( 'lazyOne' );
				watchdog.editor.loadRoot( 'lazyTwo', { data: '<p>Two</p>', attributes: { order: 5 } } );

				clock.tick( 6000 );
				clock.restore();

				setTimeout( () => throwCKEditorError( 'foo', watchdog.editor ) );

				await waitCycle();

				sinon.assert.calledOnce( restartSpy );

				expect( watchdog.editor.getFullData() ).to.deep.equal( {
					header: '<p>Foo</p>',
					content: '<p>Bar</p>',
					lazyTwo: '<p>Two</p>'
				} );

				expect( watchdog.editor.getRootsAttributes() ).to.deep.equal( {
					header: { order: 1 },
					content: { order: 2 },
					lazyTwo: { order: 5 }
				} );
			} );
		} );
	} );
} );

function throwCKEditorError( name, context ) {
	throw new CKEditorError( name, context );
}

// Feature detection works as a race condition - if the `unhandledrejection` event
// is supported then the listener should be called first. Otherwise the timeout will be reached.
function isUnhandledRejectionEventSupported() {
	return new Promise( res => {
		window.addEventListener( 'unhandledrejection', function listener() {
			res( true );

			window.removeEventListener( 'unhandledrejection', listener );
		} );

		Promise.resolve().then( () => Promise.reject( new Error() ) );

		setTimeout( () => res( false ) );
	} );
}

function waitCycle() {
	return new Promise( res => setTimeout( res ) );
}
