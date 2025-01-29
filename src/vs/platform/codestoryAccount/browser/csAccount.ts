/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import { Button } from '../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { IContextKey, IContextKeyService } from '../../contextkey/common/contextkey.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILayoutService } from '../../layout/browser/layoutService.js';
import { INotificationService, Severity } from '../../notification/common/notification.js';
import { IOpenerService } from '../../opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { defaultButtonStyles } from '../../theme/browser/defaultStyles.js';
import { CSAuthenticationSession, ICSAccountService, ICSAuthenticationService, statusAllowsAccess } from '../common/csAccount.js';
import { CS_ACCOUNT_CARD_VISIBLE } from '../common/csAccountContextKeys.js';
import './media/csAccount.css';

// Helper for DOM manipulation
const $ = dom.$;
// Storage key for tracking the number of requests made by the user
const STORAGE_KEY = 'csAccount.requestCount';

/**
 * Implementation of the CodeStory Account Service for browser environments.
 * Handles authentication UI, session management, and authorization checks.
 * Provides functionality for showing/hiding account card and managing user sessions.
 */
export class CSAccountService extends Disposable implements ICSAccountService {
	_serviceBrand: undefined;

	// Holds the current authenticated session data if user is logged in
	private authenticatedSession: CSAuthenticationSession | undefined;

	// Context key to track if the account card UI is visible
	private isVisible: IContextKey<boolean>;
	// Reference to the account card DOM element
	private csAccountCard: HTMLElement | undefined;

	// Base URL for the CodeStory website, changes based on environment
	private _websiteBase: string | null = null;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ICSAuthenticationService private readonly csAuthenticationService: ICSAuthenticationService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@INotificationService private readonly notificationService: INotificationService,
		@IStorageService private readonly storageService: IStorageService,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super();

		// Determine whether to use staging or production URL based on environment
		const isDevelopment = !this.environmentService.isBuilt || this.environmentService.isExtensionDevelopment;
		if (isDevelopment) {
			this._websiteBase = 'https://staging.aide.dev';
		} else {
			this._websiteBase = 'https://aide.dev';
		}

		// Initialize visibility context key and refresh the session
		this.isVisible = CS_ACCOUNT_CARD_VISIBLE.bindTo(this.contextKeyService);
		this.refresh();
	}

	/**
	 * Refreshes the authentication session from the authentication service.
	 * Updates the local session state based on the authentication service.
	 */
	private async refresh(): Promise<void> {
		const session = await this.csAuthenticationService.getSession();
		if (session) {
			this.authenticatedSession = session;
		} else {
			this.authenticatedSession = undefined;
		}
	}

	/**
	 * Toggles the visibility of the account UI card.
	 * If currently hidden, shows it; if visible, hides it.
	 * Updates the context key accordingly.
	 */
	toggle(): void {
		if (!this.isVisible.get()) {
			this.show();
			this.isVisible.set(true);
		} else {
			this.hide();
			this.isVisible.set(false);
		}
	}

	/**
	 * Ensures the user is authorized to use CodeStory features.
	 * Shows the account card if not authenticated, and checks subscription status.
	 * Tracks usage through storage service.
	 * @returns Promise<boolean> indicating if the user is authorized
	 */
	async ensureAuthorized(): Promise<boolean> {
		const count = this.storageService.getNumber(STORAGE_KEY, StorageScope.PROFILE, 0);
		try {
			let csAuthSession = await this.csAuthenticationService.getSession();
			if (!csAuthSession) {
				// Show the account card if no session exists
				this.toggle();
				// Wait for the user to authenticate through a Promise
				csAuthSession = await new Promise<CSAuthenticationSession>((resolve, reject) => {
					const disposable = this.csAuthenticationService.onDidAuthenticate(session => {
						if (session) {
							resolve(session);
						} else {
							reject(new Error('Authentication failed'));
						}
						disposable.dispose();
					});
				});
			}

			// Check if the user has a valid subscription
			const subscription = csAuthSession.subscription;
			if (statusAllowsAccess(subscription.status)) {
				this.storageService.store(STORAGE_KEY, count + 1, StorageScope.PROFILE, StorageTarget.MACHINE);
				return true;
			} else {
				// Show error notification with actions if subscription is invalid
				this.notificationService.prompt(
					Severity.Error,
					'You need a valid subscription to continue using Aide. Please visit the account page to update your subscription.',
					[
						{
							label: 'Open Billing Portal',
							keepOpen: true,
							run: async () => {
								await this.openerService.open(`${this._websiteBase}/account`);
							},
						},
						{
							label: 'Refresh',
							run: async () => {
								await this.csAuthenticationService.refreshTokens();
							}
						}
					]
				);
				return false; // User does not have valid subscription
			}
		} catch (error) {
			// Handle any errors that occurred during the authentication
			console.error('Error during refresh:', error);
			this.notificationService.error('An error occurred during the authentication process. Please try again later.');
			return false; // Authentication failed
		}
	}

	/**
	 * Shows the account UI card with either sign-in options or user profile.
	 * Displays user info if authenticated, or login prompt if not.
	 * Creates and manages the account card DOM elements.
	 */
	private async show(): Promise<void> {
		const container = this.layoutService.activeContainer;
		const csAccountCard = this.csAccountCard = dom.append(container, $('.cs-account-card'));
		if (!this.authenticatedSession) {
			await this.refresh();
		}

		if (this.authenticatedSession) {
			// User is signed in - show profile information and logout button
			const user = this.authenticatedSession.account;
			const profileRow = dom.append(this.csAccountCard, $('.profile-row'));
			if (user.profile_picture_url) {
				const profilePicture = dom.append(profileRow, $<HTMLImageElement>('img.profile-picture'));
				profilePicture.src = user.profile_picture_url;
			} else {
				const profilePicture = dom.append(profileRow, $('.profile-picture'));
				profilePicture.classList.add(...ThemeIcon.asClassNameArray(Codicon.account));
			}

			const userDetails = dom.append(profileRow, $('.user-details'));
			const name = dom.append(userDetails, $('.name'));
			const email = dom.append(userDetails, $('.email'));
			name.textContent = user.first_name + ' ' + user.last_name;
			email.textContent = user.email;

			// Add logout button with click handler
			const logoutButton = this._register(this.instantiationService.createInstance(Button, csAccountCard, defaultButtonStyles));
			logoutButton.label = 'Log Out';
			this._register(logoutButton.onDidClick(() => {
				if (!this.authenticatedSession) {
					return;
				}

				this.csAuthenticationService.deleteSession(this.authenticatedSession.id).then(() => {
					this.authenticatedSession = undefined;

					this.hide();
					this.show();
				});
			}));
		} else {
			// User is not signed in - show login prompt and button
			const loginPrompt = dom.append(this.csAccountCard, $('.login-prompt'));
			loginPrompt.textContent = 'Log in to CodeStory Account';
			const loginDescription = dom.append(this.csAccountCard, $('.login-description'));
			loginDescription.textContent = 'To get access to AI features';

			// Add login button with click handler
			const loginButton = this._register(this.instantiationService.createInstance(Button, csAccountCard, defaultButtonStyles));
			loginButton.label = 'Log In...';
			this._register(loginButton.onDidClick(() => {
				this.csAuthenticationService.createSession().then(session => {
					this.authenticatedSession = session;

					this.hide();
					this.show();
				});
			}));
		}
	}

	/**
	 * Hides the account UI card by removing it from the DOM.
	 */
	private hide(): void {
		if (this.csAccountCard) {
			this.csAccountCard.remove();
		}
	}
}