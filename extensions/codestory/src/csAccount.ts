/**
 * CodeStory Account Management Module
 * This module handles all account-related functionality for the CodeStory extension.
 */

import * as vscode from 'vscode';

/**
 * Represents a CodeStory account with associated subscription details
 */
export interface CSAccount {
    /** User's email address */
    email: string;
    /** Current subscription status */
    subscriptionStatus: string;
    /** Timestamp when subscription was last verified */
    lastVerified: Date;
}

/**
 * Manages the CodeStory account session and subscription state
 */
export class CSAccountManager {
    private static instance: CSAccountManager;
    private currentAccount: CSAccount | null = null;
    private readonly apiBase: string;

    /**
     * Private constructor to enforce singleton pattern
     * Determines the API base URL based on the environment
     */
    private constructor() {
        this.apiBase = vscode.env.uriScheme === 'aide' 
            ? 'https://api.codestory.ai'
            : 'https://staging-api.codestory.ai';
    }

    /**
     * Gets the singleton instance of the account manager
     */
    public static getInstance(): CSAccountManager {
        if (!CSAccountManager.instance) {
            CSAccountManager.instance = new CSAccountManager();
        }
        return CSAccountManager.instance;
    }

    /**
     * Gets the current authenticated session
     * @returns Promise resolving to the authentication session
     */
    public async getSession(): Promise<vscode.AuthenticationSession | undefined> {
        return vscode.csAuthentication.getSession();
    }

    /**
     * Verifies the current subscription status
     * @returns Promise resolving to the updated account information
     */
    public async verifySubscription(): Promise<CSAccount | null> {
        try {
            const session = await this.getSession();
            if (!session) {
                console.error('No active authentication session found');
                return null;
            }

            const response = await fetch(`${this.apiBase}/v1/usage`, {
                headers: {
                    'Authorization': `Bearer ${session.accessToken}`
                }
            });

            const data = await response.json();
            
            // Update subscription status if changed
            if (data['status'] !== session.subscription?.status) {
                await vscode.csAuthentication.refreshSession();
            }

            this.currentAccount = {
                email: session.account.email,
                subscriptionStatus: data['status'],
                lastVerified: new Date()
            };

            return this.currentAccount;
        } catch (error) {
            console.error('Failed to verify subscription:', error);
            return null;
        }
    }

    /**
     * Gets the current account information
     * @returns The current account or null if not authenticated
     */
    public getCurrentAccount(): CSAccount | null {
        return this.currentAccount;
    }
}