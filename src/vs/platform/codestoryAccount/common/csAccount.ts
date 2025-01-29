/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

/**
 * Represents an authenticated CodeStory session with user information and tokens
 */
export interface CSAuthenticationSession {
	id: string;
	accessToken: string;
	refreshToken: string;
	account: CSUser;
	waitlistPosition: number;
	subscription: SubscriptionResponse;
}

/**
 * Represents a CodeStory user's profile information
 */
export type CSUser = {
	id: string;
	first_name: string;
	last_name: string;
	email: string;
	created_at: string;
	updated_at: string;
	email_verified: boolean;
	profile_picture_url: string;
};

/**
 * Represents the encoded token data returned from authentication
 */
export type EncodedCSTokenData = {
	access_token: string;
	refresh_token: string;
};

/**
 * Response structure for user profile information including waitlist status
 */
export type CSUserProfileResponse = {
	user: CSUser;
	waitlistPosition: number;
};

/**
 * Possible subscription statuses for a CodeStory account
 */
export type SubscriptionStatus =
	| 'free'
	| 'pending_activation'
	| 'active'
	| 'pending_cancellation'
	| 'cancelled';

/**
 * Possible invoice statuses for a subscription
 */
type InvoiceStatus =
	| 'active'
	| 'canceled'
	| 'incomplete'
	| 'incomplete_expired'
	| 'past_due'
	| 'paused'
	| 'trialing'
	| 'unpaid';

/**
 * Represents the current usage statistics for a subscription
 */
export type CurrentUsage = {
	freeUsage: number;
	overageUsage: number;
	estimatedUsage: number;
	breakdown: Record<string, number>;
};

/**
 * Complete subscription information including status, usage, and billing details
 */
export type SubscriptionResponse = {
	status: SubscriptionStatus;
	usage: CurrentUsage;
	invoiceStatus?: InvoiceStatus;
	subscriptionEnding?: number;
};

/**
 * Determines if a subscription status allows access to CodeStory features
 * @param status The subscription status to check
 * @returns boolean indicating if the status allows access
 */
export const statusAllowsAccess = (status: SubscriptionStatus): boolean => {
	return status === 'free' || status === 'active' || status === 'pending_cancellation';
};

/**
 * Service decorator for the CodeStory Account Service
 */
export const ICSAccountService = createDecorator<ICSAccountService>('csAccountService');

/**
 * Interface for the CodeStory Account Service
 * Handles account UI visibility and authorization
 */
export interface ICSAccountService {
	readonly _serviceBrand: undefined;

	/**
	 * Toggles the visibility of the account UI
	 */
	toggle(): void;

	/**
	 * Ensures the user is authorized to use CodeStory features
	 * @returns Promise<boolean> indicating if the user is authorized
	 */
	ensureAuthorized(): Promise<boolean>;
}

/**
 * Service decorator for the CodeStory Authentication Service
 */
export const ICSAuthenticationService = createDecorator<ICSAuthenticationService>('csAuthenticationService');

/**
 * Interface for the CodeStory Authentication Service
 * Handles authentication sessions and token management
 */
export interface ICSAuthenticationService {
	readonly _serviceBrand: undefined;
	readonly onDidAuthenticate: Event<CSAuthenticationSession>;

	/**
	 * Creates a new authentication session
	 * @returns Promise resolving to the new session
	 */
	createSession(): Promise<CSAuthenticationSession>;

	/**
	 * Deletes an authentication session
	 * @param sessionId The ID of the session to delete
	 */
	deleteSession(sessionId: string): Promise<void>;

	/**
	 * Refreshes the authentication tokens
	 */
	refreshTokens(): Promise<void>;

	/**
	 * Gets the current authentication session if it exists
	 * @returns Promise resolving to the current session or undefined
	 */
	getSession(): Promise<CSAuthenticationSession | undefined>;
}