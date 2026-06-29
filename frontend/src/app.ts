import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'

// --- Interfaces ---
interface User {
  id: string
  name: string
  email: string | null
  phone: string | null
  is_participant: boolean
  is_tutor: boolean
  is_staff: boolean
  staff_id?: string
  username?: string
  permissions?: string[]
}

interface Tutor {
  id: string
  name: string
  email: string | null
  phone: string | null
}

interface Participant {
  id: string
  name: string
  email: string | null
  phone: string | null
}

interface ClassModel {
  id: string
  name: string
  description: string | null
  monthly_fee: number
  status: 'active' | 'inactive'
  member_count: number
  tutors: Array<{ id: string; name: string }>
  has_admin_fee?: number
}

interface ClassMember {
  member_id: string
  status: 'active' | 'inactive'
  participant_id: string
  name: string
  email: string | null
  phone: string | null
}

interface ExamEvent {
  id: string
  name: string
  fee: number
  start_date: string
  end_date: string
  class_id: string | null
  class_name: string | null
}

interface Payment {
  id: string
  participant_id: string
  participant_name: string
  class_id: string | null
  class_name: string | null
  exam_event_id: string | null
  exam_name: string | null
  type: 'course' | 'exam'
  amount: number
  admin_fee: number
  net_amount: number
  attachment_r2_key: string | null
  payment_date: string
  status: 'pending' | 'approved' | 'rejected'
  approved_by_staff_id: string | null
  approved_by_name: string | null
  receiver_staff_id?: string | null
  receiver_name?: string | null
  notes: string | null
  created_at: string
  tutor_shares?: Array<{ id: string; tutor_name: string; amount: number; status: 'paid' | 'unpaid' }>
}

interface DashboardStats {
  revenue: {
    total: number
    admin: number
    net: number
  }
  counts: {
    classes: number
    students: number
    tutors: number
    pending: number
  }
  recent_payments: any[]
}

interface AdminFeeTier {
  min_amount: number
  fee: number
}

interface AdminFeeConfig {
  enabled: boolean
  tiers: AdminFeeTier[]
}

interface InAppNotification {
  id: string
  title: string
  message: string
  time: string
  read: boolean
}

@customElement('almumtaz-crm')
export class AlMumtazCrm extends LitElement {
  // --- States ---
  @state() private token: string | null = localStorage.getItem('token')
  @state() private staff: any = null
  @state() private currentTab: 'dashboard' | 'payments' | 'classes' | 'participants' | 'reports' | 'users' | 'settings' = 'dashboard'
  
  // Data lists
  @state() private stats: DashboardStats | null = null
  @state() private payments: Payment[] = []
  @state() private classes: ClassModel[] = []
  @state() private users: User[] = []
  @state() private tutors: Tutor[] = []
  @state() private participants: Participant[] = []
  @state() private examEvents: ExamEvent[] = []
  @state() private tutorPayouts: any[] = []

  // Configuration
  @state() private adminFeeConfig: AdminFeeConfig = { enabled: true, tiers: [] }

  // Modal controls
  @state() private activeModal: 'payment-add' | 'payment-detail' | 'user-add' | 'user-edit' | 'class-add' | 'class-edit' | 'class-members' | 'exam-add' | 'exam-edit' | 'participant-detail' | 'expense-add' | 'other-income-add' | null = null

  // Finance & Expenses states
  @state() private financeTab: 'payments' | 'expenses' | 'other_incomes' = 'payments'
  @state() private expenses: any[] = []
  @state() private otherIncomes: any[] = []
  @state() private expenseSearchQuery = ''
  @state() private otherIncomeSearchQuery = ''
  @state() private userSearchQuery = ''
  
  // Temporary Form Inputs / Selection
  @state() private selectedPayment: Payment | null = null
  @state() private selectedUser: User | null = null
  @state() private selectedClass: ClassModel | null = null
  @state() private selectedClassMembers: ClassMember[] = []
  @state() private selectedExam: ExamEvent | null = null
  @state() private selectedParticipantDetail: any = null

  // Report States
  @state() private selectedReportTab: 'tutor' | 'class' | 'cashflow' = 'tutor'
  @state() private selectedReportClassId = ''
  @state() private selectedReportMonth = new Date().toISOString().substring(0, 7) // YYYY-MM
  @state() private classReportData: any[] = []
  @state() private tutorSharesReportData: any[] = []
  @state() private tutorSharesSummaryData: any[] = []
  @state() private cashflowReportData: any = null
  @state() private selectedReportTutorId = ''
  @state() private selectedReportShareStatus = ''
  @state() private selectedReportTutorMonth = ''
  @state() private showLoginPassword = false

  // Participant & Payment Search States
  @state() private participantSearchQuery = ''
  @state() private paymentSearchQuery = ''
  @state() private classMemberPaymentMonth = new Date().toISOString().substring(0, 7) // YYYY-MM

  // Live Notifications
  @state() private notifications: InAppNotification[] = []
  @state() private showNotificationsList = false
  @state() private notificationPermission = 'default'

  // Loading & Alert
  @state() private loading = false
  @state() private toastMessage: string | null = null
  @state() private toastType: 'success' | 'error' = 'success'

  // Real-time EventSource
  private sseSource: EventSource | null = null

  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    /* Core Layout */
    .app-viewport {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
      padding: 0;
    }

    @media (min-width: 768px) {
      .app-viewport {
        padding: 24px 0;
      }
    }

    .app-container {
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
      background-color: #ffffff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      position: relative;
      box-shadow: 0 0 40px rgba(0,0,0,0.05);
      padding-bottom: 72px; /* For bottom nav */
    }

    @media (min-width: 768px) {
      .app-container {
        min-height: calc(100vh - 48px);
        border-radius: 20px;
        border: 1px solid rgba(0,0,0,0.03);
      }
    }

    /* Login Layout */
    .login-container {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 32px 24px;
      background-color: #ffffff;
    }

    .login-logo {
      max-width: 260px;
      height: auto;
      margin-bottom: 24px;
      object-fit: contain;
    }

    .login-header {
      text-align: center;
      margin-bottom: 32px;
    }

    .login-header h1 {
      font-size: 26px;
      color: #111827;
      margin-bottom: 8px;
    }

    .login-header p {
      font-size: 14px;
      color: #6b7280;
    }

    .login-card {
      width: 100%;
      background: #ffffff;
      border: 1px solid #f3f4f6;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }

    /* Header Bar */
    .app-header {
      position: sticky;
      top: 0;
      background-color: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid #f3f4f6;
      padding: 14px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 100;
    }

    .header-logo {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .header-logo img, .header-logo svg {
      width: 32px;
      height: 32px;
    }

    .header-title {
      display: flex;
      flex-direction: column;
    }

    .header-title h2 {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
    }

    .header-title p {
      font-size: 11px;
      color: #10b981;
      font-weight: 500;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      position: relative;
    }

    .notification-bell {
      background: none;
      border: none;
      cursor: pointer;
      position: relative;
      padding: 6px;
      color: #4b5563;
      border-radius: 50%;
      transition: all 0.2s;
    }

    .notification-bell:active {
      background-color: #f3f4f6;
    }

    .bell-badge {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 8px;
      height: 8px;
      background-color: #ef4444;
      border-radius: 50%;
    }

    /* Bottom Navigation */
    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 100%;
      max-width: 800px;
      height: 64px;
      background-color: #ffffff;
      border-top: 1px solid #f3f4f6;
      display: flex;
      justify-content: space-around;
      align-items: center;
      z-index: 99;
      box-shadow: 0 -4px 10px rgba(0,0,0,0.02);
    }

    @media (min-width: 768px) {
      .bottom-nav {
        border-bottom-left-radius: 20px;
        border-bottom-right-radius: 20px;
        left: auto;
        transform: none;
        position: absolute;
        width: 100%;
        max-width: 100%;
      }
    }

    .nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      height: 100%;
      border: none;
      background: none;
      color: #9ca3af;
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      gap: 4px;
    }

    .nav-item-active {
      color: var(--primary, #c3a64d);
    }

    .nav-item svg {
      width: 22px;
      height: 22px;
      transition: transform 0.2s;
    }

    .nav-item:active svg {
      transform: scale(0.9);
    }

    /* Content Area */
    .app-content {
      padding: 16px;
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    /* Utilities & Cards */
    .card-summary {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }

    .summary-item {
      background-color: #ffffff;
      border: 1px solid #f3f4f6;
      border-radius: 16px;
      padding: 14px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.01);
    }

    .summary-label {
      font-size: 11px;
      color: #6b7280;
      font-weight: 500;
      margin-bottom: 4px;
    }

    .summary-val {
      font-size: 18px;
      font-weight: 700;
      color: #111827;
    }

    .summary-val.green {
      color: var(--secondary, #8ba296);
    }

    /* List items */
    .item-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    @media (min-width: 768px) {
      .item-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 16px;
      }
    }

    .list-card {
      background: white;
      border: 1px solid #f3f4f6;
      border-radius: 16px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      position: relative;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 2px 4px rgba(0,0,0,0.01);
    }

    .list-card:active {
      transform: scale(0.99);
      background-color: #fcfcfc;
    }

    .list-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }

    .list-card-title {
      font-weight: 600;
      font-size: 15px;
      color: #111827;
    }

    .list-card-subtitle {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 4px;
    }

    .list-card-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      font-size: 12px;
    }

    .list-card-amount {
      font-weight: 700;
      color: #111827;
    }

    /* Modals & Dialogs */
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 100%;
      max-width: 800px;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.4);
      z-index: 200;
      display: flex;
      justify-content: flex-end;
      flex-direction: column;
    }

    @media (min-width: 768px) {
      .modal-backdrop {
        justify-content: center;
        align-items: center;
        padding: 24px;
      }
    }

    .modal-content {
      background-color: #ffffff;
      border-top-left-radius: 24px;
      border-top-right-radius: 24px;
      padding: 24px;
      max-height: 85vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.08);
      animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @media (min-width: 768px) {
      .modal-content {
        border-radius: 20px;
        width: 100%;
        max-width: 560px;
        max-height: 80vh;
        animation: scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
    }

    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    @keyframes scaleIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .modal-close {
      background: #f3f4f6;
      border: none;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    /* In-app Toast Alert */
    .toast {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: #111827;
      color: white;
      padding: 12px 20px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: var(--shadow-lg);
      z-index: 300;
      display: flex;
      align-items: center;
      gap: 10px;
      animation: fadeIn 0.2s ease;
      width: calc(100% - 40px);
      max-width: 440px;
    }

    .toast-success {
      background-color: var(--secondary, #8ba296);
    }

    .toast-error {
      background-color: #ef4444;
    }

    /* Notification dropdown list */
    .notification-dropdown {
      position: absolute;
      top: 55px;
      right: 0;
      width: 280px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      box-shadow: var(--shadow-lg);
      z-index: 101;
      padding: 8px 0;
      max-height: 350px;
      overflow-y: auto;
    }

    .notif-item {
      padding: 10px 16px;
      border-bottom: 1px solid #f3f4f6;
      font-size: 12px;
      cursor: pointer;
    }
    .notif-item:last-child {
      border-bottom: none;
    }
    .notif-item-title {
      font-weight: 600;
      color: #111827;
      margin-bottom: 2px;
    }
    .notif-item-desc {
      color: #6b7280;
    }
    .notif-item-time {
      font-size: 10px;
      color: #9ca3af;
      margin-top: 4px;
    }

    /* Custom form styling helper */
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      cursor: pointer;
    }

    .checkbox-group input {
      width: 18px;
      height: 18px;
      accent-color: var(--primary);
    }

    .preview-box {
      background-color: var(--primary-light, #f7f5ee);
      border: 1px dashed var(--primary, #c3a64d);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 16px;
      font-size: 12px;
      color: var(--primary-hover, #b2943c);
    }
 
    .preview-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .preview-row:last-child {
      margin-bottom: 0;
      font-weight: 700;
      border-top: 1px dashed var(--border-dark);
      padding-top: 4px;
      margin-top: 4px;
    }

    /* Image Preview in Modal */
    .img-preview {
      width: 100%;
      max-height: 220px;
      object-fit: contain;
      background: #f9fafb;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      margin-bottom: 16px;
    }

    /* Tab Header Navigation */
    .tab-header {
      margin-bottom: 16px;
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .tab-header::-webkit-scrollbar {
      display: none;
    }
    .tab-btn {
      padding: 6px 14px;
      border-radius: 9999px;
      border: 1px solid #e5e7eb;
      background: white;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;
    }
    .tab-btn-active {
      background: var(--primary-light);
      color: var(--primary);
      border-color: var(--primary);
    }

    .empty-state svg {
      width: 48px;
      height: 48px;
      margin-bottom: 12px;
      color: #d1d5db;
    }

    /* Premium Form Styling inside Shadow DOM */
    .form-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      width: 100%;
    }

    .form-row {
      display: flex;
      gap: 12px;
      width: 100%;
    }

    .form-row .input-group {
      flex: 1;
      margin-bottom: 0;
    }

    .input-group {
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
    }

    .input-label {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted, #6b7280);
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .input-field {
      padding: 12px 14px;
      border-radius: var(--radius, 12px);
      border: 1px solid var(--border-dark, #e5e7eb);
      font-size: 14px;
      background-color: var(--bg-subtle, #f9fafb);
      transition: all 0.2s ease;
      width: 100%;
      color: var(--text, #1f2937);
      appearance: none;
    }

    .input-field:focus {
      outline: none;
      border-color: var(--primary, #059669);
      background-color: white;
      box-shadow: 0 0 0 3px var(--primary-light, #ecfdf5);
    }

    select.input-field {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280' stroke-width='2.5'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 14px center;
      background-size: 14px;
      padding-right: 36px;
    }

    textarea.input-field {
      resize: none;
    }

    /* Custom Checkbox */
    .checkbox-container {
      display: flex;
      align-items: center;
      position: relative;
      padding-left: 28px;
      cursor: pointer;
      font-size: 14px;
      user-select: none;
      color: var(--text, #1f2937);
      min-height: 20px;
      line-height: 20px;
      margin-bottom: 12px;
    }

    .checkbox-container input {
      position: absolute;
      opacity: 0;
      cursor: pointer;
      height: 0;
      width: 0;
    }

    .checkmark {
      position: absolute;
      top: 0;
      left: 0;
      height: 20px;
      width: 20px;
      background-color: var(--bg-subtle, #f9fafb);
      border: 1.5px solid var(--border-dark, #e5e7eb);
      border-radius: 6px;
      transition: all 0.2s ease;
    }

    .checkbox-container:hover input ~ .checkmark {
      background-color: #f3f4f6;
    }

    .checkbox-container input:checked ~ .checkmark {
      background-color: var(--primary, #059669);
      border-color: var(--primary, #059669);
    }

    .checkmark:after {
      content: "";
      position: absolute;
      display: none;
    }

    .checkbox-container input:checked ~ .checkmark:after {
      display: block;
    }

    .checkbox-container .checkmark:after {
      left: 6px;
      top: 2px;
      width: 5px;
      height: 10px;
      border: solid white;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }

    /* Reports Table */
    .report-container {
      overflow-x: auto;
      border: 1px solid var(--border, #f3f4f6);
      border-radius: var(--radius, 12px);
      margin-bottom: 16px;
      background: white;
    }

    .report-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }

    .report-table th {
      background-color: var(--bg-subtle, #f9fafb);
      padding: 12px 14px;
      font-weight: 700;
      color: var(--text-muted, #6b7280);
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border-dark, #e5e7eb);
    }

    .report-table td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border, #f3f4f6);
      color: var(--text, #1f2937);
      vertical-align: middle;
    }

    .report-table tr:last-child td {
      border-bottom: none;
    }

    .preview-box {
      background-color: var(--primary-light, #f7f5ee);
      border: 1.5px dashed var(--primary, #c3a64d);
      border-radius: var(--radius, 12px);
      padding: 12px 14px;
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
 
    .preview-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      font-weight: 600;
      color: var(--primary-hover, #b2943c);
    }
 
    .preview-row:last-child {
      border-top: 1px solid rgba(195, 166, 77, 0.2);
      padding-top: 6px;
      font-size: 14px;
      font-weight: 700;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px 18px;
      border-radius: var(--radius, 12px);
      font-size: 14px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      gap: 8px;
      text-decoration: none;
      user-select: none;
      box-sizing: border-box;
    }

    .btn:active {
      transform: scale(0.96);
    }

    .btn-primary {
      background-color: var(--primary, #059669);
      color: white;
      box-shadow: 0 4px 12px rgba(5, 150, 105, 0.15);
    }
    
    .btn-primary:hover {
      background-color: var(--primary-hover, #047857);
      box-shadow: 0 6px 16px rgba(5, 150, 105, 0.2);
    }

    .btn-secondary {
      background-color: #ffffff;
      color: var(--text, #1f2937);
      border: 1.5px solid var(--border-dark, #e5e7eb);
    }
    
    .btn-secondary:hover {
      background-color: var(--bg-subtle, #f9fafb);
      border-color: #d1d5db;
    }

    .btn-danger {
      background-color: #fee2e2;
      color: var(--status-rejected, #ef4444);
      border: 1.5px solid transparent;
    }
    
    .btn-danger:hover {
      background-color: #fca5a5;
      color: #991b1b;
    }

    .btn-danger:active {
      transform: scale(0.96);
    }
  `;

  // --- Inline SVGs ---
  private iconHome() {
    return html`<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>`
  }
  private iconPayments() {
    return html`<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`
  }
  private iconClasses() {
    return html`<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>`
  }
  private iconUsers() {
    return html`<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>`
  }
  private iconSettings() {
    return html`<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`
  }
  private iconBell() {
    return html`<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>`
  }
  private iconPlus() {
    return html`<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>`
  }
  private iconEdit() {
    return html`<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>`
  }
  private iconTrash() {
    return html`<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`
  }
  private iconClose() {
    return html`<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`
  }
  private iconReports() {
    return html`<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z"/></svg>`
  }
  private iconStudent() {
    return html`<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222"/></svg>`
  }
  private iconSearch() {
    return html`<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>`
  }
  private iconCheck() {
    return html`<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`
  }
  private iconEye() {
    return html`<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>`
  }
  private iconEyeSlash() {
    return html`<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88L3 3m12 12l9 9M21 12a9 9 0 01-1.563 3.029m-5.858-9.08a9.979 9.979 0 012.247 1.183M12 5c4.478 0 8.268 2.943 9.542 7"/></svg>`
  }

  // --- Lifecycle Hook ---
  connectedCallback() {
    super.connectedCallback()
    if (this.token) {
      this.checkLoginAndInit()
    }
    
    // Request notification permission if supported
    if ('Notification' in window) {
      this.notificationPermission = Notification.permission
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    if (this.sseSource) {
      this.sseSource.close()
    }
  }

  // --- API Handlers ---
  private showToast(message: string, type: 'success' | 'error' = 'success') {
    this.toastMessage = message
    this.toastType = type
    setTimeout(() => {
      this.toastMessage = null
    }, 3000)
  }

  private async fetchApi(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers || {})
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`)
    }

    try {
      const res = await fetch(path, { ...options, headers })
      
      if (res.status === 401) {
        // Auth error, log out
        this.logout()
        throw new Error('Sesi masuk kedaluwarsa. Silakan masuk kembali.')
      }

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Terjadi kesalahan pada server')
      }
      return data
    } catch (e: any) {
      this.showToast(e.message, 'error')
      throw e
    }
  }

  private async checkLoginAndInit() {
    this.loading = true
    try {
      const data = await this.fetchApi('/api/auth/me')
      this.staff = data.staff
      this.initData()
      this.initSSE()
    } catch (e) {
      this.logout()
    } finally {
      this.loading = false
    }
  }

  private logout() {
    localStorage.removeItem('token')
    this.token = null
    this.staff = null
    this.currentTab = 'dashboard'
    this.financeTab = 'payments'
    this.selectedReportTab = 'tutor'
    this.selectedReportClassId = ''
    this.selectedReportTutorId = ''
    this.selectedReportShareStatus = ''
    this.selectedReportTutorMonth = ''
    this.showLoginPassword = false
    this.participantSearchQuery = ''
    this.paymentSearchQuery = ''
    this.userSearchQuery = ''
    this.activeModal = null
    if (this.sseSource) {
      this.sseSource.close()
      this.sseSource = null
    }
  }

  private initSSE() {
    if (this.sseSource) {
      this.sseSource.close()
    }

    // Connect to SSE stream
    this.sseSource = new EventSource('/api/notifications/stream')
    
    this.sseSource.onmessage = (event) => {
      // Handle heartbeats
      if (event.data === 'ping') return
      
      try {
        const data = JSON.parse(event.data)
        if (data.event === 'connected') return

        // Create in-app notification
        const newNotif: InAppNotification = {
          id: crypto.randomUUID(),
          title: data.title,
          message: data.message,
          time: new Date(data.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          read: false
        }
        
        this.notifications = [newNotif, ...this.notifications]

        // Refresh stats/payments if dashboard/payment tab active
        this.loadDashboardStats()
        this.loadPayments()

        // Push standard browser notification if permission allowed
        if (this.notificationPermission === 'granted') {
          new Notification(data.title, {
            body: data.message,
            icon: '/icon.svg'
          })
        }
      } catch (err) {
        console.error('SSE JSON error:', err)
      }
    }

    this.sseSource.onerror = (e) => {
      console.warn('SSE disconnected, will reconnect automatically:', e)
    }
  }

  private async initData() {
    this.loadDashboardStats()
    this.loadPayments()
    this.loadExpenses()
    this.loadOtherIncomes()
    this.loadClasses()
    this.loadUsers()
    this.loadTutors()
    this.loadParticipants()
    this.loadExamEvents()
    this.loadSettings()
    this.loadTutorPayouts()

    if (this.currentTab === 'reports') {
      if (this.selectedReportTab === 'class') {
        this.loadClassReport()
      } else if (this.selectedReportTab === 'cashflow') {
        this.loadCashflowReport()
      } else {
        this.loadTutorSharesReport()
        this.loadTutorSharesSummary()
      }
    }
  }

  private async loadDashboardStats() {
    try {
      this.stats = await this.fetchApi('/api/dashboard/stats')
    } catch(e) {}
  }

  private async loadPayments() {
    try {
      this.payments = await this.fetchApi('/api/payments')
    } catch(e) {}
  }

  private async loadClasses() {
    try {
      this.classes = await this.fetchApi('/api/classes')
    } catch(e) {}
  }

  private async loadUsers() {
    try {
      this.users = await this.fetchApi('/api/users')
    } catch(e) {}
  }

  private async loadTutors() {
    try {
      this.tutors = await this.fetchApi('/api/tutors')
    } catch(e) {}
  }

  private async loadParticipants() {
    try {
      this.participants = await this.fetchApi('/api/participants')
    } catch(e) {}
  }

  private async loadExamEvents() {
    try {
      this.examEvents = await this.fetchApi('/api/exam-events')
    } catch(e) {}
  }

  private async loadSettings() {
    try {
      const config = await this.fetchApi('/api/settings')
      if (config.admin_fee_config) {
        this.adminFeeConfig = config.admin_fee_config
      }
    } catch(e) {}
  }

  private async loadTutorPayouts() {
    try {
      this.tutorPayouts = await this.fetchApi('/api/reports/tutor-payouts')
    } catch(e) {}
  }

  // --- Auth Login Submit ---
  private async handleLogin(e: Event) {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const username = (form.querySelector('#login-username') as HTMLInputElement).value
    const password = (form.querySelector('#login-password') as HTMLInputElement).value

    if (!username || !password) {
      this.showToast('Username dan password wajib diisi', 'error')
      return
    }

    this.loading = true
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Login gagal')
      }

      localStorage.setItem('token', data.token)
      this.token = data.token
      this.staff = data.staff
      this.showToast('Login berhasil! Selamat datang.', 'success')
      this.initData()
      this.initSSE()
    } catch (err: any) {
      this.showToast(err.message, 'error')
    } finally {
      this.loading = false
    }
  }

  // --- UI Helpers ---
  private formatRupiah(value: number): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(value)
  }

  private formatDate(dateStr: string): string {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  private requestWebNotifications() {
    if (!('Notification' in window)) {
      this.showToast('Peramban Anda tidak mendukung Notifikasi Web', 'error')
      return
    }

    Notification.requestPermission().then((permission) => {
      this.notificationPermission = permission
      if (permission === 'granted') {
        this.showToast('Notifikasi Web berhasil diaktifkan!', 'success')
        new Notification('CRM Al-Mumtaz', {
          body: 'Notifikasi berhasil diaktifkan.',
          icon: '/icon.svg'
        })
      } else {
        this.showToast('Notifikasi Web ditolak.', 'error')
      }
    })
  }

  // Check Staff Permission helper
  private hasPermission(action: 'create' | 'update' | 'delete'): boolean {
    return this.staff?.permissions?.includes(action) || false
  }

  // --- API CRUD Submits ---

  // 1. Submit User Add/Edit
  private async handleUserSubmit(e: Event) {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const name = (form.querySelector('#user-name') as HTMLInputElement).value
    const email = (form.querySelector('#user-email') as HTMLInputElement).value
    const phone = (form.querySelector('#user-phone') as HTMLInputElement).value
    
    const is_participant = (form.querySelector('#user-is-participant') as HTMLInputElement).checked
    const is_tutor = (form.querySelector('#user-is-tutor') as HTMLInputElement).checked
    const is_staff = (form.querySelector('#user-is-staff') as HTMLInputElement).checked
    
    let username = ''
    let password = ''
    let permissions: string[] = []

    if (is_staff) {
      username = (form.querySelector('#user-username') as HTMLInputElement).value
      const passElem = form.querySelector('#user-password') as HTMLInputElement
      password = passElem ? passElem.value : ''
      
      if (form.querySelector('#perm-create') && (form.querySelector('#perm-create') as HTMLInputElement).checked) permissions.push('create')
      if (form.querySelector('#perm-update') && (form.querySelector('#perm-update') as HTMLInputElement).checked) permissions.push('update')
      if (form.querySelector('#perm-delete') && (form.querySelector('#perm-delete') as HTMLInputElement).checked) permissions.push('delete')
    }

    const payload = {
      name, email, phone,
      is_participant, is_tutor, is_staff,
      username, password, permissions
    }

    this.loading = true
    try {
      if (this.activeModal === 'user-add') {
        await this.fetchApi('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        this.showToast('Pengguna berhasil ditambahkan', 'success')
      } else {
        await this.fetchApi(`/api/users/${this.selectedUser?.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        this.showToast('Pengguna berhasil diperbarui', 'success')
      }
      this.activeModal = null
      this.loadUsers()
      this.loadTutors()
      this.loadParticipants()
      this.loadDashboardStats()
    } catch (e) {} finally {
      this.loading = false
    }
  }

  // Delete User
  private async handleDeleteUser(userId: string) {
    if (!confirm('Apakah Anda yakin ingin menghapus pengguna ini secara permanen?')) return
    this.loading = true
    try {
      await this.fetchApi(`/api/users/${userId}`, { method: 'DELETE' })
      this.showToast('Pengguna berhasil dihapus', 'success')
      this.loadUsers()
      this.loadTutors()
      this.loadParticipants()
      this.loadDashboardStats()
    } catch(e){} finally {
      this.loading = false
    }
  }

  // 2. Submit Class Add/Edit
  private async handleClassSubmit(e: Event) {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const name = (form.querySelector('#class-name') as HTMLInputElement).value
    const description = (form.querySelector('#class-description') as HTMLInputElement).value
    const monthly_fee = parseInt((form.querySelector('#class-fee') as HTMLInputElement).value, 10)
    const status = (form.querySelector('#class-status') as HTMLSelectElement).value

    const has_admin_fee = (form.querySelector('#class-admin-fee') as HTMLInputElement).checked ? 1 : 0

    // Collect checked tutors
    const tutorCheckboxes = form.querySelectorAll('.class-tutor-check')
    const tutor_ids: string[] = []
    tutorCheckboxes.forEach((cb: any) => {
      if (cb.checked) tutor_ids.push(cb.value)
    })

    const payload = { name, description, monthly_fee, status, tutor_ids, has_admin_fee }

    this.loading = true
    try {
      if (this.activeModal === 'class-add') {
        await this.fetchApi('/api/classes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        this.showToast('Kelas berhasil ditambahkan', 'success')
      } else {
        await this.fetchApi(`/api/classes/${this.selectedClass?.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        this.showToast('Kelas berhasil diperbarui', 'success')
      }
      this.activeModal = null
      this.loadClasses()
      this.loadDashboardStats()
    } catch(e){} finally {
      this.loading = false
    }
  }

  // Delete Class
  private async handleDeleteClass(classId: string) {
    if (!confirm('Apakah Anda yakin ingin menghapus kelas ini?')) return
    this.loading = true
    try {
      await this.fetchApi(`/api/classes/${classId}`, { method: 'DELETE' })
      this.showToast('Kelas berhasil dihapus', 'success')
      this.loadClasses()
      this.loadDashboardStats()
    } catch(e){} finally {
      this.loading = false
    }
  }

  // Add Class Member
  private async handleAddClassMember(e: Event) {
    e.preventDefault()
    const select = this.shadowRoot?.querySelector('#add-member-select') as HTMLSelectElement
    const participant_id = select.value
    if (!participant_id) return

    this.loading = true
    try {
      await this.fetchApi(`/api/classes/${this.selectedClass?.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_id })
      })
      this.showToast('Siswa berhasil ditambahkan ke kelas', 'success')
      this.loadClassMembers(this.selectedClass!.id)
      this.loadClasses()
    } catch(e){} finally {
      this.loading = false
    }
  }

  // Toggle Class Member Status
  private async handleToggleMemberStatus(member: ClassMember) {
    const nextStatus = member.status === 'active' ? 'inactive' : 'active'
    this.loading = true
    try {
      await this.fetchApi(`/api/classes/${this.selectedClass?.id}/members/${member.participant_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      })
      this.showToast(`Status siswa diubah menjadi ${nextStatus === 'active' ? 'Aktif' : 'Nonaktif'}`, 'success')
      this.loadClassMembers(this.selectedClass!.id)
      this.loadClasses()
    } catch(e){} finally {
      this.loading = false
    }
  }

  // Delete Class Member
  private async handleDeleteClassMember(participantId: string) {
    if (!confirm('Hapus siswa dari keanggotaan kelas ini?')) return
    this.loading = true
    try {
      await this.fetchApi(`/api/classes/${this.selectedClass?.id}/members/${participantId}`, {
        method: 'DELETE'
      })
      this.showToast('Siswa berhasil dikeluarkan dari kelas', 'success')
      this.loadClassMembers(this.selectedClass!.id)
      this.loadClasses()
    } catch(e){} finally {
      this.loading = false
    }
  }

  private async loadClassMembers(classId: string) {
    try {
      this.selectedClassMembers = await this.fetchApi(`/api/classes/${classId}/members`)
    } catch(e){}
  }

  // 3. Submit Exam Event Add/Edit
  private async handleExamSubmit(e: Event) {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const name = (form.querySelector('#exam-name') as HTMLInputElement).value
    const class_id = (form.querySelector('#exam-class-id') as HTMLSelectElement).value
    const fee = parseInt((form.querySelector('#exam-fee') as HTMLInputElement).value, 10)
    const start_date = (form.querySelector('#exam-start-date') as HTMLInputElement).value
    const end_date = (form.querySelector('#exam-end-date') as HTMLInputElement).value

    const payload = { name, fee, start_date, end_date, class_id: class_id || null }

    this.loading = true
    try {
      if (this.activeModal === 'exam-add') {
        await this.fetchApi('/api/exam-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        this.showToast('Event Ujian berhasil dijadwalkan', 'success')
      } else {
        await this.fetchApi(`/api/exam-events/${this.selectedExam?.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        this.showToast('Event Ujian berhasil diperbarui', 'success')
      }
      this.activeModal = null
      this.loadExamEvents()
    } catch(e){} finally {
      this.loading = false
    }
  }

  // Delete Exam
  private async handleDeleteExam(examId: string) {
    if (!confirm('Apakah Anda yakin ingin menghapus ujian ini?')) return
    this.loading = true
    try {
      await this.fetchApi(`/api/exam-events/${examId}`, { method: 'DELETE' })
      this.showToast('Event Ujian berhasil dihapus', 'success')
      this.loadExamEvents()
    } catch(e){} finally {
      this.loading = false
    }
  }

  // 4. Input Payment Submit
  private async handlePaymentSubmit(e: Event) {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const participant_id = (form.querySelector('#pay-student') as HTMLSelectElement).value
    const type = (form.querySelector('#pay-type') as HTMLSelectElement).value
    const class_id = (form.querySelector('#pay-class') as HTMLSelectElement)?.value || ''
    const exam_event_id = (form.querySelector('#pay-exam') as HTMLSelectElement)?.value || ''
    const amount = (form.querySelector('#pay-amount') as HTMLInputElement).value
    const payment_date = (form.querySelector('#pay-date') as HTMLInputElement).value
    const receiver_staff_id = (form.querySelector('#pay-receiver') as HTMLSelectElement).value
    const notes = (form.querySelector('#pay-notes') as HTMLTextAreaElement).value
    const fileInput = form.querySelector('#pay-file') as HTMLInputElement
    const file = fileInput.files?.[0]

    if (!participant_id || !amount || !payment_date || !receiver_staff_id) {
      this.showToast('Mohon lengkapi semua kolom wajib', 'error')
      return
    }

    const formData = new FormData()
    formData.append('participant_id', participant_id)
    formData.append('type', type)
    if (type === 'course' && class_id) formData.append('class_id', class_id)
    if (type === 'exam' && exam_event_id) formData.append('exam_event_id', exam_event_id)
    formData.append('amount', amount)
    formData.append('payment_date', payment_date)
    formData.append('receiver_staff_id', receiver_staff_id)
    if (notes) formData.append('notes', notes)
    if (file) formData.append('attachment', file)

    this.loading = true
    try {
      await this.fetchApi('/api/payments', {
        method: 'POST',
        body: formData
      })
      this.showToast('Pembayaran berhasil diinput. Menunggu verifikasi.', 'success')
      this.activeModal = null
      this.loadPayments()
      this.loadDashboardStats()
    } catch(e){} finally {
      this.loading = false
    }
  }

  // Update Payment Status (Approve/Reject)
  private async handleVerifyPayment(status: 'approved' | 'rejected') {
    const notesInput = this.shadowRoot?.querySelector('#verify-notes') as HTMLTextAreaElement
    const notes = notesInput ? notesInput.value : ''

    this.loading = true
    try {
      await this.fetchApi(`/api/payments/${this.selectedPayment?.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes })
      })
      this.showToast(`Pembayaran telah ${status === 'approved' ? 'disetujui' : 'ditolak'}`, 'success')
      this.activeModal = null
      this.loadPayments()
      this.loadDashboardStats()
      this.loadTutorPayouts()
    } catch(e){} finally {
      this.loading = false
    }
  }

  // Delete Payment
  private async handleDeletePayment(paymentId: string) {
    if (!confirm('Apakah Anda yakin ingin menghapus transaksi pembayaran ini secara permanen?')) return
    this.loading = true
    try {
      await this.fetchApi(`/api/payments/${paymentId}`, { method: 'DELETE' })
      this.showToast('Transaksi pembayaran berhasil dihapus', 'success')
      this.activeModal = null
      this.loadPayments()
      this.loadDashboardStats()
      this.loadTutorPayouts()
    } catch(e){} finally {
      this.loading = false
    }
  }

  // 5. Save Settings Configuration
  private async handleSaveSettings(e: Event) {
    e.preventDefault()
    this.loading = true
    try {
      await this.fetchApi('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'admin_fee_config',
          value: this.adminFeeConfig
        })
      })
      this.showToast('Pengaturan biaya admin berhasil disimpan', 'success')
      this.loadSettings()
    } catch(e){} finally {
      this.loading = false
    }
  }

  // --- Real-time Preview calculations ---
  @state() private liveAmount = 0
  
  private updateLivePreviewAmount(amountVal: string) {
    this.liveAmount = parseInt(amountVal, 10) || 0
  }

  private getLivePreviewFee() {
    if (this.selectedPaymentType === 'course' && this.selectedClassForPaymentId) {
      const cls = this.classes.find(c => c.id === this.selectedClassForPaymentId)
      if (cls && cls.has_admin_fee === 0) {
        return 0
      }
    }
    if (!this.adminFeeConfig.enabled || this.adminFeeConfig.tiers.length === 0) {
      return 0
    }
    const sorted = [...this.adminFeeConfig.tiers].sort((a,b) => b.min_amount - a.min_amount)
    for (const t of sorted) {
      if (this.liveAmount >= t.min_amount) {
        return t.fee
      }
    }
    return 0
  }

  // --- Render Templates ---

  render() {
    if (!this.token) {
      return this.renderLogin()
    }

    return html`
      <div class="app-viewport">
        <div class="app-container">
          <!-- Top Header -->
          <div class="app-header">
            <div class="header-logo">
              <img src="/logo.jpg" alt="Rumah Qur'an Al-Mumtaz" style="height: 38px; width: auto; object-fit: contain;" />
            </div>
            
            <div class="header-actions">
              <button class="notification-bell" @click=${() => this.showNotificationsList = !this.showNotificationsList}>
                ${this.iconBell()}
                ${this.notifications.some(n => !n.read) ? html`<div class="bell-badge"></div>` : ''}
              </button>
              
              <!-- Notifications Dropdown -->
              ${this.showNotificationsList ? this.renderNotificationsDropdown() : ''}
            </div>
          </div>

          <!-- Toast Alert Alert -->
          ${this.toastMessage ? html`
            <div class="toast toast-${this.toastType}">
              <span>${this.toastMessage}</span>
            </div>
          ` : ''}

          <!-- Content Tab Area -->
          <div class="app-content">
            ${this.loading ? html`
              <div style="display:flex; justify-content:center; padding: 40px;">
                <span style="font-size:14px; color:var(--text-muted);">Memuat data...</span>
              </div>
            ` : ''}

            ${!this.loading ? this.renderActiveTab() : ''}
          </div>

          <!-- Bottom Navigation Bar -->
          <div class="bottom-nav">
            <button class="nav-item ${this.currentTab === 'dashboard' ? 'nav-item-active' : ''}" @click=${() => this.changeTab('dashboard')}>
              ${this.iconHome()}
              <span>Dasbor</span>
            </button>
            <button class="nav-item ${this.currentTab === 'payments' ? 'nav-item-active' : ''}" @click=${() => this.changeTab('payments')}>
              ${this.iconPayments()}
              <span>Keuangan</span>
            </button>
            <button class="nav-item ${this.currentTab === 'classes' ? 'nav-item-active' : ''}" @click=${() => this.changeTab('classes')}>
              ${this.iconClasses()}
              <span>Kelas</span>
            </button>
            <button class="nav-item ${this.currentTab === 'participants' ? 'nav-item-active' : ''}" @click=${() => this.changeTab('participants')}>
              ${this.iconStudent()}
              <span>Siswa</span>
            </button>
            <button class="nav-item ${this.currentTab === 'reports' ? 'nav-item-active' : ''}" @click=${() => this.changeTab('reports')}>
              ${this.iconReports()}
              <span>Laporan</span>
            </button>
            <button class="nav-item ${this.currentTab === 'settings' ? 'nav-item-active' : ''}" @click=${() => this.changeTab('settings')}>
              ${this.iconSettings()}
              <span>Pengaturan</span>
            </button>
          </div>

          <!-- Modals Manager -->
          ${this.renderActiveModal()}
        </div>
      </div>
    `;
  }

  private changeTab(tab: 'dashboard' | 'payments' | 'classes' | 'participants' | 'reports' | 'users' | 'settings') {
    this.currentTab = tab
    this.showNotificationsList = false
    this.initData() // Reload on navigate
  }

  // --- Tab 1: Dashboard View ---
  private renderDashboard() {
    if (!this.stats) return html`<div>Memuat Dasbor...</div>`
    
    return html`
      <div style="margin-bottom: 20px;">
        <p style="font-size: 14px; color: var(--text-muted);">Halo, <strong>${this.staff?.name}</strong> (${this.staff?.username})</p>
        <h1 style="font-size: 22px; margin-top: 4px;">Selamat Datang di Al-Mumtaz</h1>
      </div>

      <!-- Financial overview -->
      <div class="card-summary">
        <div class="summary-item">
          <div class="summary-label">Pendapatan Bersih (Net)</div>
          <div class="summary-val green">${this.formatRupiah(this.stats.revenue.net)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Dana Admin (Kas)</div>
          <div class="summary-val">${this.formatRupiah(this.stats.revenue.admin)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Total Kotor</div>
          <div class="summary-val" style="font-size: 15px;">${this.formatRupiah(this.stats.revenue.total)}</div>
        </div>
        <div class="summary-item" style="background-color: var(--status-pending-bg); border-color: #fde68a;">
          <div class="summary-label" style="color: var(--status-pending);">Pembayaran Pending</div>
          <div class="summary-val" style="color: var(--status-pending);">${this.stats.counts.pending}</div>
        </div>
      </div>

      <!-- Quick Action Buttons -->
      ${this.hasPermission('create') ? html`
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;">
          <button class="btn btn-primary" @click=${() => { this.activeModal = 'payment-add'; this.liveAmount = 0; }}>
            ${this.iconPlus()} Input Pembayaran
          </button>
          <button class="btn btn-secondary" @click=${() => this.activeModal = 'class-add'}>
            ${this.iconPlus()} Kelas Baru
          </button>
        </div>
      ` : ''}

      <!-- Payout breakdown of tutors -->
      <div class="card" style="margin-bottom: 24px;">
        <h3 style="margin-bottom: 12px; font-size: 15px; border-bottom: 1px solid #f3f4f6; padding-bottom: 8px;">
          Akumulasi Mukafaah Pengajar (Tutors)
        </h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${this.tutorPayouts.length === 0 ? html`
            <p style="font-size: 13px; text-align: center; color: var(--text-muted);">Belum ada mukafaah yang didistribusikan.</p>
          ` : this.tutorPayouts.map(t => html`
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
              <span style="font-weight: 500; color: var(--text);">${t.tutor_name}</span>
              <div style="text-align: right;">
                <span style="font-weight: 700; color: var(--primary);">${this.formatRupiah(t.total_payout)}</span>
                <div style="font-size: 10px; color: var(--text-muted);">${t.payment_count} kali mukafaah</div>
              </div>
            </div>
          `)}
        </div>
      </div>

      <!-- Counts summary details -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 24px; text-align: center;">
        <div style="background: #f9fafb; border-radius: 12px; padding: 10px; border: 1px solid #f3f4f6;">
          <div style="font-size: 18px; font-weight: 700; color: #111827;">${this.stats.counts.students}</div>
          <div style="font-size: 10px; color: var(--text-muted); font-weight: 500; text-transform: uppercase;">Siswa</div>
        </div>
        <div style="background: #f9fafb; border-radius: 12px; padding: 10px; border: 1px solid #f3f4f6;">
          <div style="font-size: 18px; font-weight: 700; color: #111827;">${this.stats.counts.tutors}</div>
          <div style="font-size: 10px; color: var(--text-muted); font-weight: 500; text-transform: uppercase;">Pengajar</div>
        </div>
        <div style="background: #f9fafb; border-radius: 12px; padding: 10px; border: 1px solid #f3f4f6;">
          <div style="font-size: 18px; font-weight: 700; color: #111827;">${this.stats.counts.classes}</div>
          <div style="font-size: 10px; color: var(--text-muted); font-weight: 500; text-transform: uppercase;">Kelas Aktif</div>
        </div>
      </div>

      <!-- Recent Payments list -->
      <div>
        <h3 style="margin-bottom: 12px; font-size: 15px;">Transaksi Pembayaran Terbaru</h3>
        <div class="item-list">
          ${this.stats.recent_payments.length === 0 ? html`
            <p style="text-align: center; font-size: 13px; padding: 20px; color: var(--text-muted);">Belum ada transaksi pembayaran.</p>
          ` : this.stats.recent_payments.map(p => html`
            <div class="list-card" @click=${() => this.openPaymentDetails(p.id)}>
              <div class="list-card-header">
                <span class="list-card-title">${p.participant_name}</span>
                <span class="badge badge-${p.status}">${p.status === 'approved' ? 'Disetujui' : p.status === 'rejected' ? 'Ditolak' : 'Pending'}</span>
              </div>
              <div class="list-card-subtitle">
                ${p.type === 'course' ? `Iuran Kelas: ${p.class_name}` : `Ujian: ${p.exam_name}`}
              </div>
              <div class="list-card-meta">
                <span style="color: var(--text-muted);">${this.formatDate(p.payment_date)}</span>
                <span class="list-card-amount">${this.formatRupiah(p.amount)}</span>
              </div>
            </div>
          `)}
        </div>
      </div>
    `;
  }

  // --- Tab 2: Payments View ---
  @state() private paymentFilter: 'all' | 'pending' | 'approved' | 'rejected' = 'all'

  private renderPayments() {
    return html`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
        <h2>Keuangan & Kas</h2>
      </div>

      <!-- Tab local buttons -->
      <div style="display:flex; gap:6px; margin-bottom:16px; overflow-x:auto; padding-bottom: 2px;">
        <button class="tab-btn ${this.financeTab === 'payments' ? 'tab-btn-active' : ''}" 
                @click=${() => this.financeTab = 'payments'}>
          Transaksi Masuk (Iuran)
        </button>
        <button class="tab-btn ${this.financeTab === 'expenses' ? 'tab-btn-active' : ''}" 
                @click=${() => { this.financeTab = 'expenses'; this.loadExpenses(); }}>
          Pengeluaran Kas
        </button>
        <button class="tab-btn ${this.financeTab === 'other_incomes' ? 'tab-btn-active' : ''}" 
                @click=${() => { this.financeTab = 'other_incomes'; this.loadOtherIncomes(); }}>
          Pemasukan Lain
        </button>
      </div>

      ${this.financeTab === 'expenses' 
        ? this.renderExpensesView() 
        : (this.financeTab === 'other_incomes' ? this.renderOtherIncomesView() : this.renderPaymentsView())}
    `;
  }

  private renderPaymentsView() {
    const query = this.paymentSearchQuery.toLowerCase().trim()
    const filteredPayments = this.payments.filter(p => {
      // 1. Status Filter
      if (this.paymentFilter !== 'all' && p.status !== this.paymentFilter) return false
      
      // 2. Search Query Filter
      if (query !== '') {
        const matchesName = p.participant_name.toLowerCase().includes(query)
        const matchesClassName = p.class_name && p.class_name.toLowerCase().includes(query)
        const matchesExamName = p.exam_name && p.exam_name.toLowerCase().includes(query)
        const matchesNotes = p.notes && p.notes.toLowerCase().includes(query)
        const matchesType = (p.type === 'course' ? 'kelas' : 'ujian').includes(query)
        return matchesName || matchesClassName || matchesExamName || matchesNotes || matchesType
      }
      return true
    })

    return html`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
        <h3 style="font-size:14px; margin:0;">Transaksi Masuk (Iuran)</h3>
        ${this.hasPermission('create') ? html`
          <button class="btn btn-primary" style="padding: 6px 12px; font-size: 11px;" @click=${() => { this.activeModal = 'payment-add'; this.liveAmount = 0; }}>
            ${this.iconPlus()} Input Pembayaran
          </button>
        ` : ''}
      </div>

      <!-- Status Filters -->
      <div style="display:flex; gap:6px; margin-bottom:12px; overflow-x:auto; padding-bottom: 2px;">
        <button class="tab-btn ${this.paymentFilter === 'all' ? 'tab-btn-active' : ''}" @click=${() => this.paymentFilter = 'all'}>Semua</button>
        <button class="tab-btn ${this.paymentFilter === 'pending' ? 'tab-btn-active' : ''}" @click=${() => this.paymentFilter = 'pending'}>Pending</button>
        <button class="tab-btn ${this.paymentFilter === 'approved' ? 'tab-btn-active' : ''}" @click=${() => this.paymentFilter = 'approved'}>Disetujui</button>
        <button class="tab-btn ${this.paymentFilter === 'rejected' ? 'tab-btn-active' : ''}" @click=${() => this.paymentFilter = 'rejected'}>Ditolak</button>
      </div>

      <!-- Search Box -->
      <div class="input-group" style="position:relative; margin-bottom:12px;">
        <input class="input-field" type="text" placeholder="Cari nama siswa, kelas, ujian, atau catatan..." 
               .value=${this.paymentSearchQuery} 
               @input=${(e: any) => this.paymentSearchQuery = e.target.value} 
               style="padding-left:38px;" />
        <div style="position:absolute; left:12px; top:12px; color:var(--text-muted);">
          ${this.iconSearch()}
        </div>
      </div>

      <!-- Payments list -->
      <div class="item-list">
        ${filteredPayments.length === 0 ? html`
          <div class="empty-state">
            ${this.iconPayments()}
            <p>Tidak ada data transaksi pembayaran.</p>
          </div>
        ` : filteredPayments.map(p => html`
          <div class="list-card" @click=${() => this.openPaymentDetails(p.id)}>
            <div class="list-card-header">
              <span class="list-card-title">${p.participant_name}</span>
              <span class="badge badge-${p.status}">${p.status === 'approved' ? 'Disetujui' : p.status === 'rejected' ? 'Ditolak' : 'Pending'}</span>
            </div>
            <div class="list-card-subtitle">
              ${p.type === 'course' ? `Kelas: ${p.class_name}` : `Ujian: ${p.exam_name}`}
            </div>
            <div class="list-card-meta">
              <span style="color: var(--text-muted);">${this.formatDate(p.payment_date)}</span>
              <span class="list-card-amount">${this.formatRupiah(p.amount)}</span>
            </div>
          </div>
        `)}
      </div>
    `;
  }

  private renderExpensesView() {
    const query = this.expenseSearchQuery.toLowerCase().trim()
    const filteredExpenses = this.expenses.filter(e => 
      e.description.toLowerCase().includes(query) || 
      (e.created_by_name && e.created_by_name.toLowerCase().includes(query)) ||
      e.expense_date.includes(query)
    )

    return html`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
        <h3 style="font-size:14px; margin:0;">Pencatatan Pengeluaran Kas</h3>
        ${this.hasPermission('create') ? html`
          <button class="btn btn-primary" style="padding: 6px 12px; font-size: 11px;" @click=${() => { this.activeModal = 'expense-add'; }}>
            ${this.iconPlus()} Catat Pengeluaran
          </button>
        ` : ''}
      </div>

      <!-- Search Box -->
      <div class="input-group" style="position:relative; margin-bottom:12px;">
        <input class="input-field" type="text" placeholder="Cari keterangan atau pencatat pengeluaran..." 
               .value=${this.expenseSearchQuery} 
               @input=${(e: any) => this.expenseSearchQuery = e.target.value} 
               style="padding-left:38px;" />
        <div style="position:absolute; left:12px; top:12px; color:var(--text-muted);">
          ${this.iconSearch()}
        </div>
      </div>

      <!-- Expenses list -->
      <div class="item-list">
        ${filteredExpenses.length === 0 ? html`
          <div class="empty-state">
            ${this.iconPayments()}
            <p>Tidak ada data pengeluaran kas.</p>
          </div>
        ` : filteredExpenses.map(e => html`
          <div class="list-card" style="cursor: default;">
            <div class="list-card-header">
              <span class="list-card-title" style="color: #ef4444;">${e.description}</span>
              ${this.hasPermission('delete') ? html`
                <button class="btn btn-danger" style="padding:4px; background-color:#fee2e2;" @click=${() => this.handleDeleteExpense(e.id)}>
                  ${this.iconClose()}
                </button>
              ` : ''}
            </div>
            <div class="list-card-subtitle" style="font-size: 11px; margin-top: 2px; display:flex; justify-content:space-between; align-items:center;">
              <span>Dicatat oleh: ${e.created_by_name || 'Staff'}</span>
              ${e.attachment_r2_key ? html`
                <a class="btn" style="padding: 2px 6px; font-size: 10px; background-color: var(--status-approved-bg); color: var(--status-approved); display: inline-flex; align-items: center; gap: 2px; border-radius: 4px; text-decoration: none;"
                   href="/api/payments/attachments/${e.attachment_r2_key}" target="_blank">
                  Bukti
                </a>
              ` : ''}
            </div>
            <div class="list-card-meta" style="margin-top: 6px;">
              <span style="color: var(--text-muted);">${this.formatDate(e.expense_date)}</span>
              <span style="color: #ef4444; font-weight: 700;">-${this.formatRupiah(e.amount)}</span>
            </div>
          </div>
        `)}
      </div>
    `;
  }

  private renderOtherIncomesView() {
    const query = this.otherIncomeSearchQuery.toLowerCase().trim()
    const filteredOtherIncomes = this.otherIncomes.filter(o => 
      o.description.toLowerCase().includes(query) || 
      o.category.toLowerCase().includes(query) ||
      (o.created_by_name && o.created_by_name.toLowerCase().includes(query)) ||
      o.income_date.includes(query)
    )

    return html`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
        <h3 style="font-size:14px; margin:0;">Pencatatan Pemasukan Kas Lainnya</h3>
        ${this.hasPermission('create') ? html`
          <button class="btn btn-primary" style="padding: 6px 12px; font-size: 11px;" @click=${() => { this.activeModal = 'other-income-add'; }}>
            ${this.iconPlus()} Catat Pemasukan
          </button>
        ` : ''}
      </div>

      <!-- Search Box -->
      <div class="input-group" style="position:relative; margin-bottom:12px;">
        <input class="input-field" type="text" placeholder="Cari keterangan, kategori, atau pencatat..." 
               .value=${this.otherIncomeSearchQuery} 
               @input=${(e: any) => this.otherIncomeSearchQuery = e.target.value} 
               style="padding-left:38px;" />
        <div style="position:absolute; left:12px; top:12px; color:var(--text-muted);">
          ${this.iconSearch()}
        </div>
      </div>

      <!-- Other Incomes list -->
      <div class="item-list">
        ${filteredOtherIncomes.length === 0 ? html`
          <div class="empty-state">
            ${this.iconPayments()}
            <p>Tidak ada data pemasukan kas lainnya.</p>
          </div>
        ` : filteredOtherIncomes.map(o => html`
          <div class="list-card" style="cursor: default;">
            <div class="list-card-header">
              <span class="list-card-title" style="color: #22c55e;">[${o.category}] ${o.description}</span>
              ${this.hasPermission('delete') ? html`
                <button class="btn btn-danger" style="padding:4px; background-color:#fee2e2;" @click=${() => this.handleDeleteOtherIncome(o.id)}>
                  ${this.iconClose()}
                </button>
              ` : ''}
            </div>
            <div class="list-card-subtitle" style="font-size: 11px; margin-top: 2px; display:flex; justify-content:space-between; align-items:center;">
              <span>Dicatat oleh: ${o.created_by_name || 'Staff'}</span>
              ${o.attachment_r2_key ? html`
                <a class="btn" style="padding: 2px 6px; font-size: 10px; background-color: var(--status-approved-bg); color: var(--status-approved); display: inline-flex; align-items: center; gap: 2px; border-radius: 4px; text-decoration: none;"
                   href="/api/payments/attachments/${o.attachment_r2_key}" target="_blank">
                  Bukti
                </a>
              ` : ''}
            </div>
            <div class="list-card-meta" style="margin-top: 6px;">
              <span style="color: var(--text-muted);">${this.formatDate(o.income_date)}</span>
              <span style="color: #22c55e; font-weight: 700;">+${this.formatRupiah(o.amount)}</span>
            </div>
          </div>
        `)}
      </div>
    `;
  }

  private openPaymentDetails(id: string) {
    const payment = this.payments.find(p => p.id === id)
    if (payment) {
      this.selectedPayment = payment
      this.activeModal = 'payment-detail'
    }
  }

  // --- Tab 3: Classes View ---
  @state() private subClassTab: 'classes' | 'exams' = 'classes'

  private renderClassesTab() {
    return html`
      <div class="tab-header">
        <button class="tab-btn ${this.subClassTab === 'classes' ? 'tab-btn-active' : ''}" @click=${() => this.subClassTab = 'classes'}>Daftar Kelas</button>
        <button class="tab-btn ${this.subClassTab === 'exams' ? 'tab-btn-active' : ''}" @click=${() => this.subClassTab = 'exams'}>Ujian Insidental</button>
      </div>

      ${this.subClassTab === 'classes' ? this.renderClassesList() : this.renderExamsList()}
    `;
  }

  private renderClassesList() {
    return html`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2>Manajemen Kelas</h2>
        ${this.hasPermission('create') ? html`
          <button class="btn btn-primary" style="padding: 8px 12px; font-size: 12px;" @click=${() => this.activeModal = 'class-add'}>
            ${this.iconPlus()} Kelas Baru
          </button>
        ` : ''}
      </div>

      <div class="item-list">
        ${this.classes.length === 0 ? html`
          <div class="empty-state">
            ${this.iconClasses()}
            <p>Belum ada kelas terdaftar.</p>
          </div>
        ` : this.classes.map(c => html`
          <div class="list-card" style="cursor: default;" @click=${() => {}}>
            <div class="list-card-header">
              <span class="list-card-title">${c.name}</span>
              <span class="badge badge-${c.status === 'active' ? 'approved' : 'rejected'}">
                ${c.status === 'active' ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
            
            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">${c.description || 'Tidak ada deskripsi'}</p>
            
            <div style="font-size:12px; margin-bottom: 10px;">
              <strong>Pengajar: </strong>
              ${c.tutors.length === 0 
                ? html`<span style="color:var(--status-rejected);">Belum ditentukan</span>` 
                : c.tutors.map(t => t.name).join(', ')}
            </div>

            <div style="border-top:1px solid #f3f4f6; padding-top:10px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
              <div>
                <span>Anggota: <strong>${c.member_count} Siswa</strong></span>
              </div>
              <span style="font-weight:700; color:var(--text);">${this.formatRupiah(c.monthly_fee)}/bln</span>
            </div>

            <!-- Class Actions -->
            <div style="margin-top:14px; display:flex; gap:8px; justify-content: flex-end;">
              <button class="btn btn-secondary" style="padding: 6px 10px; font-size: 11px;" @click=${() => this.openClassMembers(c)}>
                Kelola Anggota
              </button>
              ${this.hasPermission('update') ? html`
                <button class="btn btn-secondary" style="padding: 6px; color: var(--primary);" @click=${() => this.openClassEdit(c)}>
                  ${this.iconEdit()}
                </button>
              ` : ''}
              ${this.hasPermission('delete') ? html`
                <button class="btn btn-danger" style="padding: 6px; background-color:#fee2e2;" @click=${() => this.handleDeleteClass(c.id)}>
                  ${this.iconTrash()}
                </button>
              ` : ''}
            </div>
          </div>
        `)}
      </div>
    `;
  }

  private openClassEdit(c: ClassModel) {
    this.selectedClass = c
    this.activeModal = 'class-edit'
  }

  private openClassMembers(c: ClassModel) {
    this.selectedClass = c
    this.loadClassMembers(c.id)
    this.activeModal = 'class-members'
  }

  private renderExamsList() {
    return html`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2>Event Ujian Insidental</h2>
        ${this.hasPermission('create') ? html`
          <button class="btn btn-primary" style="padding: 8px 12px; font-size: 12px;" @click=${() => this.activeModal = 'exam-add'}>
            ${this.iconPlus()} Jadwal Ujian
          </button>
        ` : ''}
      </div>

      <div class="item-list">
        ${this.examEvents.length === 0 ? html`
          <div class="empty-state">
            ${this.iconClasses()}
            <p>Belum ada jadwal ujian insidental.</p>
          </div>
        ` : this.examEvents.map(e => html`
          <div class="list-card" style="cursor: default;">
            <div class="list-card-header">
              <span class="list-card-title">${e.name}</span>
              <span class="badge badge-approved" style="background-color: var(--primary-light); color: var(--primary);">Ujian</span>
            </div>
            
            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 4px;">
              Periode: <strong>${this.formatDate(e.start_date)}</strong> s/d <strong>${this.formatDate(e.end_date)}</strong>
            </p>

            <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
              Kelas Khusus: <strong>${e.class_name || 'Terbuka Umum'}</strong>
            </p>

            <div style="border-top:1px solid #f3f4f6; padding-top:10px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
              <span>Biaya Pendaftaran:</span>
              <span style="font-weight:700; color:var(--text);">${this.formatRupiah(e.fee)}</span>
            </div>

            <!-- Exam Actions -->
            ${this.hasPermission('update') || this.hasPermission('delete') ? html`
              <div style="margin-top:14px; display:flex; gap:8px; justify-content: flex-end;">
                ${this.hasPermission('update') ? html`
                  <button class="btn btn-secondary" style="padding: 6px; color: var(--primary);" @click=${() => { this.selectedExam = e; this.activeModal = 'exam-edit'; }}>
                    ${this.iconEdit()}
                  </button>
                ` : ''}
                ${this.hasPermission('delete') ? html`
                  <button class="btn btn-danger" style="padding: 6px; background-color:#fee2e2;" @click=${() => this.handleDeleteExam(e.id)}>
                    ${this.iconTrash()}
                  </button>
                ` : ''}
              </div>
            ` : ''}
          </div>
        `)}
      </div>
    `;
  }

  // --- Tab 4: Users View ---
  private renderUsers() {
    const query = this.userSearchQuery.toLowerCase().trim()
    const filteredUsers = this.users.filter(u => {
      if (query === '') return true
      const matchesName = u.name && u.name.toLowerCase().includes(query)
      const matchesUsername = u.username && u.username.toLowerCase().includes(query)
      const matchesEmail = u.email && u.email.toLowerCase().includes(query)
      const matchesPhone = u.phone && u.phone.toLowerCase().includes(query)
      const matchesRole = (
        (u.is_participant ? 'siswa' : '') + ' ' +
        (u.is_tutor ? 'tutor guru pengajar' : '') + ' ' +
        (u.is_staff ? 'staff admin' : '')
      ).toLowerCase().includes(query)
      return matchesName || matchesUsername || matchesEmail || matchesPhone || matchesRole
    })

    return html`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
        <h2>Manajemen Pengguna</h2>
        ${this.hasPermission('create') ? html`
          <button class="btn btn-primary" style="padding: 8px 12px; font-size: 12px;" @click=${() => { this.selectedUser = null; this.isStaffSelected = false; this.activeModal = 'user-add'; }}>
            ${this.iconPlus()} Tambah User
          </button>
        ` : ''}
      </div>

      <!-- Search Box -->
      <div class="input-group" style="position:relative; margin-bottom:16px;">
        <input class="input-field" type="text" placeholder="Cari nama, username, email, telp, atau role (siswa/tutor/staff)..." 
               .value=${this.userSearchQuery} 
               @input=${(e: any) => this.userSearchQuery = e.target.value} 
               style="padding-left:38px;" />
        <div style="position:absolute; left:12px; top:12px; color:var(--text-muted);">
          ${this.iconSearch()}
        </div>
      </div>

      <div class="item-list">
        ${filteredUsers.length === 0 ? html`
          <div class="empty-state">
            <p style="text-align: center; color: var(--text-muted);">Tidak ada pengguna ditemukan.</p>
          </div>
        ` : filteredUsers.map(u => html`
          <div class="list-card" style="cursor: default;">
            <div class="list-card-header" style="margin-bottom: 4px;">
              <span class="list-card-title">${u.name}</span>
            </div>
            
            <div style="display:flex; gap:4px; margin-bottom: 8px;">
              ${u.is_participant ? html`<span class="badge badge-approved" style="background:#eff6ff; color:#1e40af; font-size:9px;">Siswa</span>` : ''}
              ${u.is_tutor ? html`<span class="badge badge-approved" style="background:#f5f3ff; color:#5b21b6; font-size:9px;">Tutor</span>` : ''}
              ${u.is_staff ? html`<span class="badge badge-pending" style="font-size:9px;">Staff (${u.username})</span>` : ''}
            </div>

            <div style="font-size: 12px; color: var(--text-muted);">
              <div>Email: ${u.email || '-'}</div>
              <div>Telp: ${u.phone || '-'}</div>
              ${u.is_staff ? html`<div>Hak Izin: <span style="font-family:monospace; color:#374151;">${u.permissions?.join(', ')}</span></div>` : ''}
            </div>

            <!-- Actions -->
            <div style="margin-top:12px; display:flex; gap:8px; justify-content: flex-end;">
              ${this.hasPermission('update') ? html`
                <button class="btn btn-secondary" style="padding: 6px; color: var(--primary);" @click=${() => { this.selectedUser = u; this.isStaffSelected = u.is_staff; this.activeModal = 'user-edit'; }}>
                  ${this.iconEdit()}
                </button>
              ` : ''}
              ${this.hasPermission('delete') && u.id !== this.staff?.user_id ? html`
                <button class="btn btn-danger" style="padding: 6px; background-color:#fee2e2;" @click=${() => this.handleDeleteUser(u.id)}>
                  ${this.iconTrash()}
                </button>
              ` : ''}
            </div>
          </div>
        `)}
      </div>
    `;
  }

  // --- Tab 5: Settings View ---
  private renderSettings() {
    return html`
      <h2>Pengaturan Sistem</h2>
      <p style="margin-bottom: 24px;">Atur biaya admin transaksi siswa dan notifikasi browser.</p>

      <!-- Web Push Notifications block -->
      <div class="card" style="margin-bottom: 20px;">
        <h3 style="margin-bottom: 8px;">Pemberitahuan Sistem (Web Notifications)</h3>
        <p style="font-size: 13px; margin-bottom: 14px;">Aktifkan notifikasi untuk menerima pemberitahuan instan saat ada iuran masuk atau persetujuan transaksi.</p>
        
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size: 13px; font-weight: 500;">
            Status Izin: 
            <strong style="color: ${this.notificationPermission === 'granted' ? 'var(--secondary)' : this.notificationPermission === 'denied' ? '#ef4444' : '#f59e0b'};">
              ${this.notificationPermission === 'granted' ? 'Diizinkan' : this.notificationPermission === 'denied' ? 'Ditolak' : 'Belum Ditanyakan'}
            </strong>
          </span>
          
          ${this.notificationPermission !== 'granted' ? html`
            <button class="btn btn-primary" style="padding: 8px 14px; font-size:12px;" @click=${this.requestWebNotifications}>
              Aktifkan Notifikasi
            </button>
          ` : html`
            <button class="btn btn-secondary" style="padding: 8px 14px; font-size:12px;" @click=${() => this.showToast('Notifikasi sudah aktif!', 'success')}>
              Sudah Aktif
            </button>
          `}
        </div>
      </div>

      <!-- Admin Fee configuration form -->
      <form class="card" @submit=${this.handleSaveSettings}>
        <h3 style="margin-bottom: 12px; border-bottom:1px solid #f3f4f6; padding-bottom:8px;">Konfigurasi Biaya Admin</h3>
        
        <div class="checkbox-group" style="margin-bottom: 20px;">
          <input type="checkbox" id="admin-fee-enabled" 
                 .checked=${this.adminFeeConfig.enabled}
                 @change=${(e: any) => this.adminFeeConfig = { ...this.adminFeeConfig, enabled: e.target.checked }} />
          <label for="admin-fee-enabled" style="font-size:14px; font-weight:600;">Aktifkan Biaya Admin Transaksi</label>
        </div>

        ${this.adminFeeConfig.enabled ? html`
          <h4 style="font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">Aturan Batas Nominal (Tiers)</h4>
          
          <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;">
            ${this.adminFeeConfig.tiers.map((t, idx) => html`
              <div style="display:grid; grid-template-columns: 1fr 1fr 40px; gap:8px; align-items:center;">
                <input class="input-field" type="number" placeholder="Min nominal (Rp)" 
                       .value=${t.min_amount} 
                       @input=${(e: any) => this.updateSettingTier(idx, 'min_amount', e.target.value)} />
                <input class="input-field" type="number" placeholder="Biaya Admin (Rp)" 
                       .value=${t.fee} 
                       @input=${(e: any) => this.updateSettingTier(idx, 'fee', e.target.value)} />
                <button type="button" class="btn btn-danger" style="padding:8px; background-color:#fee2e2; border-radius:8px;" @click=${() => this.removeSettingTier(idx)}>
                  ${this.iconClose()}
                </button>
              </div>
            `)}
          </div>

          <button type="button" class="btn btn-secondary" style="width:100%; margin-bottom: 20px; font-size: 13px; padding: 8px 12px;" @click=${this.addSettingTier}>
            + Tambah Aturan Baru
          </button>
        ` : ''}

        ${this.hasPermission('update') ? html`
          <button type="submit" class="btn btn-primary" style="width:100%;">Simpan Konfigurasi</button>
        ` : html`<p style="font-size:12px; text-align:center; color:var(--status-rejected);">Hanya staff tingkat edit/update yang dapat mengubah konfigurasi.</p>`}
      </form>

      <!-- Section: Manajemen Pengguna & Keluar -->
      <div style="margin-top: 24px; display:flex; flex-direction:column; gap:12px;">
        <button class="btn btn-secondary" style="width:100%;" @click=${() => this.changeTab('users')}>
          ${this.iconUsers()} Kelola Akun Staff & Guru
        </button>
        
        <button class="btn btn-danger" style="width:100%; border: 1px solid #fee2e2;" @click=${this.logout}>
          Keluar dari Sistem (Logout)
        </button>
      </div>
    `;
  }

  private addSettingTier() {
    const tiers = [...this.adminFeeConfig.tiers, { min_amount: 0, fee: 0 }]
    this.adminFeeConfig = { ...this.adminFeeConfig, tiers }
  }

  private removeSettingTier(index: number) {
    const tiers = this.adminFeeConfig.tiers.filter((_, i) => i !== index)
    this.adminFeeConfig = { ...this.adminFeeConfig, tiers }
  }

  private updateSettingTier(index: number, field: 'min_amount' | 'fee', value: string) {
    const tiers = this.adminFeeConfig.tiers.map((t, i) => {
      if (i === index) {
        return { ...t, [field]: parseInt(value, 10) || 0 }
      }
      return t
    })
    this.adminFeeConfig = { ...this.adminFeeConfig, tiers }
  }

  // --- Tab: Siswa (Participants Management) ---
  private renderParticipantsTab() {
    const query = this.participantSearchQuery.toLowerCase().trim()
    const filtered = this.participants.filter(p => 
      p.name.toLowerCase().includes(query) || 
      (p.email && p.email.toLowerCase().includes(query)) ||
      (p.phone && p.phone.includes(query))
    )

    return html`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
        <h2>Manajemen Siswa (Peserta)</h2>
      </div>

      <!-- Search Box -->
      <div class="input-group" style="position:relative; margin-bottom:16px;">
        <input class="input-field" type="text" placeholder="Cari nama, email, atau telepon..." 
               .value=${this.participantSearchQuery} 
               @input=${(e: any) => this.participantSearchQuery = e.target.value} 
               style="padding-left:38px;" />
        <div style="position:absolute; left:12px; top:12px; color:var(--text-muted);">
          ${this.iconSearch()}
        </div>
      </div>

      <div class="item-list">
        ${filtered.length === 0 ? html`
          <p style="text-align: center; color: var(--text-muted); padding:20px;">Siswa tidak ditemukan.</p>
        ` : filtered.map(p => html`
          <div class="list-card" style="cursor: pointer;" @click=${() => this.showParticipantDetails(p.id)}>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span class="list-card-title" style="color:var(--primary); font-size:15px;">${p.name}</span>
              <span style="font-size:11px; color:var(--text-muted);">ID: ${p.id}</span>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom:6px;">
              <div>Email: ${p.email || '-'}</div>
              <div>Telp: ${p.phone || '-'}</div>
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <span style="font-size:11px; color:var(--primary); font-weight:600; display:flex; align-items:center; gap:4px;">
                Lihat Detail & Riwayat →
              </span>
            </div>
          </div>
        `)}
      </div>
    `
  }

  private async showParticipantDetails(id: string) {
    this.loading = true
    try {
      const details = await this.fetchApi(`/api/participants/${id}/details`)
      this.selectedParticipantDetail = details
      this.activeModal = 'participant-detail'
    } catch(e) {} finally {
      this.loading = false
    }
  }

  // --- Tab: Laporan ---
  private renderReportsTab() {
    return html`
      <h2>Laporan Keuangan & Pengajar</h2>
      <p style="margin-bottom: 20px; font-size:13px;">Kelola status mukafaah pengajar, status pembayaran iuran kelas siswa, dan laporan arus kas.</p>

      <div style="display:flex; gap:8px; margin-bottom:16px; overflow-x:auto; padding-bottom:4px;">
        <button class="tab-btn ${this.selectedReportTab === 'tutor' ? 'tab-btn-active' : ''}" 
                @click=${() => { this.selectedReportTab = 'tutor'; this.loadTutorSharesReport(); this.loadTutorSharesSummary(); }}>
          Mukafaah Pengajar
        </button>
        <button class="tab-btn ${this.selectedReportTab === 'class' ? 'tab-btn-active' : ''}" 
                @click=${() => { this.selectedReportTab = 'class'; if (this.classes.length > 0 && !this.selectedReportClassId) { this.selectedReportClassId = this.classes[0].id; }; this.loadClassReport(); }}>
          Iuran Kelas Bulanan
        </button>
        <button class="tab-btn ${this.selectedReportTab === 'cashflow' ? 'tab-btn-active' : ''}" 
                @click=${() => { this.selectedReportTab = 'cashflow'; this.loadCashflowReport(); }}>
          Laporan Arus Kas
        </button>
      </div>

      ${this.selectedReportTab === 'class' 
        ? this.renderClassPaymentsReport() 
        : this.selectedReportTab === 'cashflow' 
          ? this.renderCashflowReportView() 
          : this.renderTutorSharesReportView()}
    `
  }

  // Class monthly payment status report view
  private renderClassPaymentsReport() {
    return html`
      <div class="card" style="margin-bottom:16px; display:flex; flex-direction:column; gap:12px;">
        <h3 style="font-size:14px; margin-bottom:4px;">Filter Kelas & Bulan</h3>
        <div class="form-row">
          <div class="input-group">
            <label class="input-label">Pilih Kelas</label>
            <select class="input-field" .value=${this.selectedReportClassId} @change=${(e: any) => { this.selectedReportClassId = e.target.value; this.loadClassReport(); }}>
              ${this.classes.map(c => html`<option value=${c.id}>${c.name}</option>`)}
            </select>
          </div>
          <div class="input-group">
            <label class="input-label">Pilih Bulan</label>
            <input class="input-field" type="month" .value=${this.selectedReportMonth} @input=${(e: any) => { this.selectedReportMonth = e.target.value; this.loadClassReport(); }} />
          </div>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; margin-top:8px;">
        <h4 style="font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin:0;">Status Pembayaran Siswa</h4>
        ${this.classReportData.length > 0 ? html`
          <button class="btn btn-secondary" style="padding: 6px 12px; font-size:11px;" @click=${this.exportClassPaymentsToPDF}>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right:4px; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Cetak PDF
          </button>
        ` : ''}
      </div>

      <div class="report-container">
        <table class="report-table">
          <thead>
            <tr>
              <th>Nama Siswa</th>
              <th>Status</th>
              <th>Tanggal Bayar</th>
              <th>Nominal</th>
            </tr>
          </thead>
          <tbody>
            ${this.classReportData.length === 0 ? html`
              <tr>
                <td colspan="4" style="text-align:center; color:var(--text-muted);">Tidak ada siswa aktif di kelas ini.</td>
              </tr>
            ` : this.classReportData.map(row => html`
              <tr>
                <td style="font-weight:600;">${row.name}</td>
                <td>
                  <span class="badge ${row.has_paid ? 'badge-approved' : 'badge-rejected'}" style="display:inline-flex; align-items:center; gap:4px;">
                    ${row.has_paid ? html`${this.iconCheck()} Lunas` : 'Belum Lunas'}
                  </span>
                </td>
                <td>${row.payment_date || '-'}</td>
                <td style="font-weight:600; color: ${row.has_paid ? 'var(--primary)' : 'inherit'};">
                  ${row.amount ? this.formatRupiah(row.amount) : '-'}
                </td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    `
  }

  // Tutor Payout shares list & summary reports view
  private renderTutorSharesReportView() {
    return html`
      <!-- Summary Section -->
      <div style="margin-bottom: 20px;">
        <h3 style="font-size:15px; margin-bottom:10px;">Rekap Bulanan Mukafaah</h3>
        <div class="report-container">
          <table class="report-table">
            <thead>
              <tr>
                <th>Nama Pengajar</th>
                <th>Bulan</th>
                <th>Sudah Dibayar</th>
                <th>Belum Dibayar</th>
              </tr>
            </thead>
            <tbody>
              ${this.tutorSharesSummaryData.length === 0 ? html`
                <tr>
                  <td colspan="4" style="text-align:center; color:var(--text-muted);">Belum ada data rekap mukafaah.</td>
                </tr>
              ` : this.tutorSharesSummaryData.map(row => html`
                <tr>
                  <td style="font-weight:600;">${row.tutor_name}</td>
                  <td style="font-family:monospace;">${row.month}</td>
                  <td style="color:var(--status-approved); font-weight:600;">${this.formatRupiah(row.total_paid)}</td>
                  <td style="color:var(--status-pending); font-weight:600;">${this.formatRupiah(row.total_unpaid)}</td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Filters & Shares List -->
      <div class="card" style="margin-bottom:16px;">
        <h3 style="font-size:14px; margin-bottom:10px;">Filter Daftar Transaksi Mukafaah</h3>
        <div class="form-grid">
          <div class="form-row" style="flex-wrap: wrap; gap: 12px;">
            <div class="input-group" style="flex: 1; min-width: 120px;">
              <label class="input-label">Filter Pengajar</label>
              <select class="input-field" .value=${this.selectedReportTutorId} @change=${(e: any) => { this.selectedReportTutorId = e.target.value; this.loadTutorSharesReport(); }}>
                <option value="">Semua Pengajar</option>
                ${this.tutors.map(t => html`<option value=${t.id}>${t.name}</option>`)}
              </select>
            </div>
            <div class="input-group" style="flex: 1; min-width: 120px;">
              <label class="input-label">Filter Status</label>
              <select class="input-field" .value=${this.selectedReportShareStatus} @change=${(e: any) => { this.selectedReportShareStatus = e.target.value; this.loadTutorSharesReport(); }}>
                <option value="">Semua Status</option>
                <option value="unpaid">Belum Dibayar (Unpaid)</option>
                <option value="paid">Sudah Dibayar (Paid)</option>
              </select>
            </div>
            <div class="input-group" style="flex: 1; min-width: 120px;">
              <label class="input-label">Filter Bulan</label>
              <input class="input-field" type="month" .value=${this.selectedReportTutorMonth} @input=${(e: any) => { this.selectedReportTutorMonth = e.target.value; this.loadTutorSharesReport(); }} />
            </div>
          </div>
        </div>
      </div>

      <div class="report-container">
        <table class="report-table">
          <thead>
            <tr>
              <th>Rincian Pembayaran</th>
              <th>Tutor / Nominal</th>
              <th>Status</th>
              ${this.hasPermission('update') ? html`<th style="text-align:right;">Aksi</th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${this.tutorSharesReportData.length === 0 ? html`
              <tr>
                <td colspan="4" style="text-align:center; color:var(--text-muted);">Tidak ada transaksi mukafaah ditemukan.</td>
              </tr>
            ` : this.tutorSharesReportData.map(row => html`
              <tr>
                <td>
                  <div style="font-weight:600; color:var(--primary);">${row.class_name}</div>
                  <div style="font-size:11px; color:var(--text-muted);">Siswa: ${row.student_name}</div>
                  <div style="font-size:10px; color:var(--text-muted); font-family:monospace;">Tgl: ${row.payment_date}</div>
                </td>
                <td>
                  <div style="font-weight:600;">${row.tutor_name}</div>
                  <div style="font-size:12px; color:var(--status-approved); font-weight:600;">Share: ${this.formatRupiah(row.amount)}</div>
                </td>
                <td>
                  <span class="badge ${row.share_status === 'paid' ? 'badge-approved' : 'badge-pending'}">
                    ${row.share_status === 'paid' ? 'Lunas (Paid)' : 'Belum (Unpaid)'}
                  </span>
                </td>
                ${this.hasPermission('update') ? html`
                  <td style="text-align:right;">
                    <button class="btn ${row.share_status === 'paid' ? 'btn-secondary' : 'btn-primary'}" 
                            style="padding:6px 10px; font-size:11px; border-radius:6px; font-weight:600;"
                            @click=${() => this.toggleTutorShareStatus(row.id, row.share_status)}>
                      ${row.share_status === 'paid' ? 'Set Unpaid' : 'Set Paid'}
                    </button>
                  </td>
                ` : ''}
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    `
  }

  // Cashflow Report View
  private renderCashflowReportView() {
    const r = this.cashflowReportData
    const startingBalance = r ? r.starting_balance : 0
    const totalInflow = r ? r.total_inflow : 0
    const totalOutflow = r ? r.total_outflow : 0
    const endingBalance = r ? r.ending_balance : 0

    return html`
      <!-- Month Filter Card -->
      <div class="card" style="margin-bottom:16px; display:flex; flex-direction:column; gap:12px;">
        <h3 style="font-size:14px; margin-bottom:4px;">Filter Periode Laporan Arus Kas</h3>
        <div class="form-row">
          <div class="input-group">
            <label class="input-label">Pilih Bulan</label>
            <input class="input-field" type="month" .value=${this.selectedReportMonth} 
                   @input=${(e: any) => { this.selectedReportMonth = e.target.value; this.loadCashflowReport(); }} />
          </div>
        </div>
      </div>

      <!-- Cashflow Summary Cards -->
      <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; margin-bottom:16px;">
        <div class="card" style="padding:12px; background-color:var(--bg-subtle); border: 1px solid var(--border-dark);">
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Saldo Awal</div>
          <div style="font-size:16px; font-weight:700; color:var(--text); margin-top:4px;">${this.formatRupiah(startingBalance)}</div>
        </div>
        <div class="card" style="padding:12px; background-color:var(--status-approved-bg); border: 1px solid var(--status-approved)33;">
          <div style="font-size:11px; color:var(--status-approved); text-transform:uppercase; letter-spacing:0.5px;">Iuran & Ujian</div>
          <div style="font-size:16px; font-weight:700; color:var(--status-approved); margin-top:4px;">+${this.formatRupiah(r ? r.total_payments_inflow : 0)}</div>
        </div>
        <div class="card" style="padding:12px; background-color:var(--status-approved-bg); border: 1px solid var(--status-approved)33;">
          <div style="font-size:11px; color:var(--status-approved); text-transform:uppercase; letter-spacing:0.5px;">Pemasukan Lain</div>
          <div style="font-size:16px; font-weight:700; color:var(--status-approved); margin-top:4px;">+${this.formatRupiah(r ? r.total_other_inflow : 0)}</div>
        </div>
        <div class="card" style="padding:12px; background-color:var(--status-approved-bg); border: 1px solid var(--status-approved)33;">
          <div style="font-size:11px; color:var(--status-approved); text-transform:uppercase; letter-spacing:0.5px;">Total Pemasukan</div>
          <div style="font-size:16px; font-weight:700; color:var(--status-approved); margin-top:4px;">+${this.formatRupiah(totalInflow)}</div>
        </div>
        <div class="card" style="padding:12px; background-color:#fee2e2; border: 1px solid #fecaca;">
          <div style="font-size:11px; color:#ef4444; text-transform:uppercase; letter-spacing:0.5px;">Total Pengeluaran</div>
          <div style="font-size:16px; font-weight:700; color:#ef4444; margin-top:4px;">-${this.formatRupiah(totalOutflow)}</div>
        </div>
        <div class="card" style="padding:12px; background-color:var(--bg-subtle); border: 1px solid var(--primary)33;">
          <div style="font-size:11px; color:var(--primary); text-transform:uppercase; letter-spacing:0.5px;">Saldo Akhir</div>
          <div style="font-size:16px; font-weight:700; color:var(--primary); margin-top:4px;">${this.formatRupiah(endingBalance)}</div>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; margin-top:8px;">
        <h4 style="font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin:0;">Buku Aliran Kas</h4>
        ${r ? html`
          <button class="btn btn-secondary" style="padding: 6px 12px; font-size:11px;" @click=${this.exportCashflowToPDF}>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right:4px; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Cetak PDF
          </button>
        ` : ''}
      </div>

      <!-- Inflows Table -->
      <div class="card" style="padding:12px; margin-bottom:16px; border-color:#e5e7eb;">
        <h3 style="font-size:13px; color:var(--status-approved); margin-bottom:8px;">Aliran Masuk (Iuran Siswa & Ujian)</h3>
        <div style="overflow-x:auto;">
          <table class="report-table" style="min-width: 100%;">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Siswa</th>
                <th>Keterangan</th>
                <th style="text-align:right;">Nominal</th>
              </tr>
            </thead>
            <tbody>
              ${!r || r.inflows.length === 0 ? html`
                <tr>
                  <td colspan="4" style="text-align:center; color:var(--text-muted);">Tidak ada pemasukan kas.</td>
                </tr>
              ` : r.inflows.map((item: any) => html`
                <tr>
                  <td>${this.formatDate(item.payment_date)}</td>
                  <td style="font-weight:600;">${item.participant_name}</td>
                  <td>${item.type === 'course' ? `Kelas: ${item.class_name}` : `Ujian: ${item.exam_name}`}</td>
                  <td style="text-align:right; font-weight:700; color:var(--status-approved);">+${this.formatRupiah(item.amount)}</td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Other Inflows Table -->
      <div class="card" style="padding:12px; margin-bottom:16px; border-color:#e5e7eb;">
        <h3 style="font-size:13px; color:#22c55e; margin-bottom:8px;">Aliran Masuk (Pemasukan Lainnya)</h3>
        <div style="overflow-x:auto;">
          <table class="report-table" style="min-width: 100%;">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Kategori</th>
                <th>Keterangan</th>
                <th style="text-align:right;">Nominal</th>
              </tr>
            </thead>
            <tbody>
              ${!r || !r.other_inflows || r.other_inflows.length === 0 ? html`
                <tr>
                  <td colspan="4" style="text-align:center; color:var(--text-muted);">Tidak ada pemasukan kas lainnya.</td>
                </tr>
              ` : r.other_inflows.map((item: any) => html`
                <tr>
                  <td>${this.formatDate(item.payment_date)}</td>
                  <td style="font-weight:600;">${item.participant_name}</td>
                  <td>
                    <span style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                      <span>${item.class_name}</span>
                      ${item.attachment_r2_key ? html`
                        <a href="/api/payments/attachments/${item.attachment_r2_key}" target="_blank" style="font-size:10px; color:var(--primary); font-weight:600; text-decoration:none; margin-left:8px; background-color:var(--primary-light); padding:2px 6px; border-radius:4px; display:inline-block;">Bukti</a>
                      ` : ''}
                    </span>
                  </td>
                  <td style="text-align:right; font-weight:700; color:#22c55e;">+${this.formatRupiah(item.amount)}</td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Outflows Table -->
      <div class="card" style="padding:12px; margin-bottom:16px; border-color:#e5e7eb;">
        <h3 style="font-size:13px; color:#ef4444; margin-bottom:8px;">Aliran Keluar (Pengeluaran Kas)</h3>
        <div style="overflow-x:auto;">
          <table class="report-table" style="min-width: 100%;">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Keterangan</th>
                <th>Pencatat</th>
                <th style="text-align:right;">Nominal</th>
              </tr>
            </thead>
            <tbody>
              ${!r || r.outflows.length === 0 ? html`
                <tr>
                  <td colspan="4" style="text-align:center; color:var(--text-muted);">Tidak ada pengeluaran kas.</td>
                </tr>
              ` : r.outflows.map((item: any) => html`
                <tr>
                  <td>${this.formatDate(item.expense_date)}</td>
                  <td style="font-weight:600; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                    <span>${item.description}</span>
                    ${item.attachment_r2_key ? html`
                      <a href="/api/payments/attachments/${item.attachment_r2_key}" target="_blank" style="font-size:10px; color:var(--primary); font-weight:600; text-decoration:none; margin-left:8px; background-color:var(--primary-light); padding:2px 6px; border-radius:4px; display:inline-block;">Bukti</a>
                    ` : ''}
                  </td>
                  <td>${item.created_by_name || 'Staff'}</td>
                  <td style="text-align:right; font-weight:700; color:#ef4444;">-${this.formatRupiah(item.amount)}</td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Mukafaah Outflows Table -->
      <div class="card" style="padding:12px; margin-bottom:16px; border-color:#e5e7eb;">
        <h3 style="font-size:13px; color:#5b21b6; margin-bottom:8px;">Aliran Keluar (Mukafaah Pengajar)</h3>
        <div style="overflow-x:auto;">
          <table class="report-table" style="min-width: 100%;">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Nama Pengajar</th>
                <th>Keterangan</th>
                <th style="text-align:right;">Nominal</th>
              </tr>
            </thead>
            <tbody>
              ${!r || !r.mukafaah_outflows || r.mukafaah_outflows.length === 0 ? html`
                <tr>
                  <td colspan="4" style="text-align:center; color:var(--text-muted);">Tidak ada pengeluaran mukafaah pengajar.</td>
                </tr>
              ` : r.mukafaah_outflows.map((item: any) => html`
                <tr>
                  <td>${this.formatDate(item.expense_date)}</td>
                  <td style="font-weight:600; color:#5b21b6;">${item.tutor_name}</td>
                  <td>Kelas: ${item.class_name}</td>
                  <td style="text-align:right; font-weight:700; color:#5b21b6;">-${this.formatRupiah(item.amount)}</td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  private async loadClassReport() {
    if (!this.selectedReportClassId || !this.selectedReportMonth) return
    this.loading = true
    try {
      const data = await this.fetchApi(`/api/reports/class-payments?class_id=${this.selectedReportClassId}&month=${this.selectedReportMonth}`)
      this.classReportData = data
    } catch(e) {} finally {
      this.loading = false
    }
  }

  private async loadCashflowReport() {
    if (!this.selectedReportMonth) return
    this.loading = true
    try {
      this.cashflowReportData = await this.fetchApi(`/api/reports/cashflow?month=${this.selectedReportMonth}`)
    } catch(e) {} finally {
      this.loading = false
    }
  }

  private formatMonthName(monthStr: string) {
    if (!monthStr) return ''
    const [year, month] = monthStr.split('-')
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ]
    const idx = parseInt(month, 10) - 1
    return `${months[idx]} ${year}`
  }

  private exportClassPaymentsToPDF() {
    const classId = this.selectedReportClassId
    const month = this.selectedReportMonth
    const cls = this.classes.find(c => c.id === classId)
    if (!cls) {
      this.showToast('Silakan pilih kelas terlebih dahulu', 'error')
      return
    }

    if (this.classReportData.length === 0) {
      this.showToast('Tidak ada data untuk diekspor', 'error')
      return
    }

    const printWindow = window.open('', '_blank', 'width=900,height=800')
    if (!printWindow) {
      this.showToast('Gagal membuka jendela cetak. Pastikan pop-up diizinkan.', 'error')
      return
    }

    const logoUrl = window.location.origin + '/logo.jpg'
    const periodStr = this.formatMonthName(month)
    const currentDate = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })

    const rowsHtml = this.classReportData.map((row, index) => {
      const isLunas = !!row.has_paid
      const statusText = isLunas ? 'Lunas' : 'Belum Lunas'
      const statusColor = isLunas ? '#8ba296' : '#ef4444'
      const statusBg = isLunas ? '#f2f5f4' : '#fef2f2'
      return `
        <tr>
          <td style="text-align: center; border: 1px solid #e5e7eb; padding: 10px;">${index + 1}</td>
          <td style="border: 1px solid #e5e7eb; padding: 10px; font-weight: 600; color: #1f2937;">${row.name}</td>
          <td style="text-align: center; border: 1px solid #e5e7eb; padding: 10px;">
            <span style="display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background-color: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusColor}44;">
              ${statusText}
            </span>
          </td>
          <td style="text-align: center; border: 1px solid #e5e7eb; padding: 10px; color: #4b5563;">
            ${row.payment_date ? this.formatDate(row.payment_date) : '-'}
          </td>
          <td style="text-align: right; border: 1px solid #e5e7eb; padding: 10px; font-weight: 700; color: #1f2937;">
            ${row.amount > 0 ? this.formatRupiah(row.amount) : '-'}
          </td>
        </tr>
      `
    }).join('')

    printWindow.document.write(`
      <html>
        <head>
          <title>Laporan Iuran Kelas - ${cls.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
            body {
              font-family: 'Outfit', sans-serif;
              color: #1f2937;
              margin: 0;
              padding: 40px;
              line-height: 1.5;
            }
            .header-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 24px;
            }
            .logo-img {
              height: 60px;
              width: auto;
            }
            .divider {
              border-top: 3px double #c3a64d;
              margin: 20px 0;
            }
            .report-title {
              font-size: 20px;
              font-weight: 700;
              text-align: center;
              color: #c3a64d;
              text-transform: uppercase;
              margin-bottom: 20px;
              letter-spacing: 0.8px;
            }
            .meta-table {
              width: 100%;
              margin-bottom: 24px;
              font-size: 14px;
            }
            .meta-label {
              color: #6b7280;
              font-weight: 500;
              width: 120px;
            }
            .meta-value {
              font-weight: 600;
              color: #1f2937;
            }
            .report-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
              font-size: 13px;
            }
            .report-table th {
              background-color: #f7f5ee;
              color: #c3a64d;
              border: 1px solid #e5e7eb;
              padding: 12px 10px;
              font-weight: 700;
              text-transform: uppercase;
              font-size: 11px;
              letter-spacing: 0.5px;
            }
            .signature-section {
              margin-top: 60px;
              width: 100%;
              font-size: 14px;
            }
            @media print {
              body {
                padding: 20px;
              }
              button {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <table class="header-table">
            <tr>
              <td>
                <img class="logo-img" src="${logoUrl}" alt="Al-Mumtaz Logo" />
              </td>
              <td style="text-align: right; font-size: 12px; color: #6b7280; line-height: 1.4;">
                <strong style="color: #c3a64d; font-size: 16px;">Rumah Qur'an Al-Mumtaz</strong><br />
                Lembaga Pelatihan & Pembacaan Al-Quran E-Learning<br />
                Email: info@almumtaz.sch.id | Web: fragrant-surf-ea74.awanio.workers.dev
              </td>
            </tr>
          </table>

          <div class="divider"></div>

          <div class="report-title">Laporan Status Iuran Kelas</div>

          <table class="meta-table">
            <tr>
              <td class="meta-label">Nama Kelas:</td>
              <td class="meta-value">${cls.name}</td>
              <td class="meta-label" style="text-align: right;">Bulan / Periode:</td>
              <td class="meta-value" style="text-align: right;">${periodStr}</td>
            </tr>
            <tr>
              <td class="meta-label">Tanggal Cetak:</td>
              <td class="meta-value">${currentDate}</td>
              <td class="meta-label" style="text-align: right;">Dicetak Oleh:</td>
              <td class="meta-value" style="text-align: right;">${this.staff?.name || 'Administrator'}</td>
            </tr>
          </table>

          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 40px;">No</th>
                <th>Nama Siswa</th>
                <th style="width: 130px;">Status</th>
                <th style="width: 150px;">Tanggal Bayar</th>
                <th style="width: 150px;">Nominal</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <table class="signature-section">
            <tr>
              <td style="width: 60%;"></td>
              <td style="text-align: center;">
                <p style="margin-bottom: 60px; color: #4b5563;">Mengetahui,<br /><strong>Kepala Administrasi Rumah Qur'an</strong></p>
                <strong style="text-decoration: underline; color: #1f2937;">${this.staff?.name || 'Mika Dwi Indah'}</strong><br />
                <span style="font-size: 12px; color: #6b7280; font-weight: 500;">Staff Admin Utama</span>
              </td>
            </tr>
          </table>

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  private async loadTutorSharesReport() {
    this.loading = true
    try {
      let url = '/api/reports/tutor-shares'
      const params = []
      if (this.selectedReportTutorId) params.push(`tutor_id=${this.selectedReportTutorId}`)
      if (this.selectedReportShareStatus) params.push(`status=${this.selectedReportShareStatus}`)
      if (this.selectedReportTutorMonth) params.push(`month=${this.selectedReportTutorMonth}`)
      if (params.length > 0) url += `?${params.join('&')}`

      const data = await this.fetchApi(url)
      this.tutorSharesReportData = data
    } catch(e) {} finally {
      this.loading = false
    }
  }

  private async loadTutorSharesSummary() {
    try {
      const data = await this.fetchApi('/api/reports/tutor-shares-summary')
      this.tutorSharesSummaryData = data
    } catch(e) {}
  }

  private async toggleTutorShareStatus(id: string, currentStatus: string) {
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid'
    this.loading = true
    try {
      await this.fetchApi(`/api/tutor-shares/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      this.showToast('Status mukafaah berhasil diperbarui', 'success')
      await this.loadTutorSharesReport()
      await this.loadTutorSharesSummary()
    } catch(e) {} finally {
      this.loading = false
    }
  }

  // --- Router Tab dispatcher ---
  private renderActiveTab() {
    switch (this.currentTab) {
      case 'dashboard':
        return this.renderDashboard()
      case 'payments':
        return this.renderPayments()
      case 'classes':
        return this.renderClassesTab()
      case 'participants':
        return this.renderParticipantsTab()
      case 'reports':
        return this.renderReportsTab()
      case 'users':
        return this.renderUsers()
      case 'settings':
        return this.renderSettings()
      default:
        return this.renderDashboard()
    }
  }

  // --- Tab: Login View ---
  private renderLogin() {
    return html`
      <div class="login-container">
        <div class="login-header">
          <img class="login-logo" src="/logo.jpg" alt="Al-Mumtaz Logo" />
          <h1 style="display: none;">CRM Al-Mumtaz</h1>
          <p>Portal Khusus Staff & Administrasi</p>
        </div>

        <form class="login-card" @submit=${this.handleLogin}>
          <div class="input-group">
            <label class="input-label" for="login-username">Nama Pengguna (Username)</label>
            <input class="input-field" type="text" id="login-username" placeholder="Masukkan username" required />
          </div>
          
          <div class="input-group" style="margin-bottom: 24px;">
            <label class="input-label" for="login-password">Kata Sandi (Password)</label>
            <div style="position: relative;">
              <input class="input-field" type=${this.showLoginPassword ? 'text' : 'password'} id="login-password" placeholder="Masukkan password" required style="padding-right: 44px; width: 100%;" />
              <button type="button" @click=${() => this.showLoginPassword = !this.showLoginPassword} style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; padding: 4px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center;">
                ${this.showLoginPassword ? this.iconEyeSlash() : this.iconEye()}
              </button>
            </div>
          </div>

          <button class="btn btn-primary" type="submit" style="width:100%;">
            Masuk ke Aplikasi
          </button>
        </form>

        ${this.toastMessage ? html`
          <div class="toast toast-${this.toastType}">
            <span>${this.toastMessage}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  // --- Notifications Bell List dropdown ---
  private renderNotificationsDropdown() {
    return html`
      <div class="notification-dropdown">
        <div style="padding:8px 16px; border-bottom:1px solid #f3f4f6; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:700; font-size:13px; color:#111827;">Pemberitahuan</span>
          <button style="background:none; border:none; color:var(--primary); font-size:11px; cursor:pointer;" @click=${this.markAllNotificationsRead}>
            Baca Semua
          </button>
        </div>
        ${this.notifications.length === 0 ? html`
          <div style="padding:24px 16px; text-align:center; color:var(--text-muted); font-size:12px;">
            Tidak ada pemberitahuan baru
          </div>
        ` : this.notifications.map(n => html`
          <div class="notif-item" style="background-color: ${n.read ? 'white' : 'var(--primary-light)'}" @click=${() => this.readNotification(n.id)}>
            <div class="notif-item-title">${n.title}</div>
            <div class="notif-item-desc">${n.message}</div>
            <div class="notif-item-time">${n.time}</div>
          </div>
        `)}
      </div>
    `;
  }

  private readNotification(id: string) {
    this.notifications = this.notifications.map(n => n.id === id ? { ...n, read: true } : n)
  }

  private markAllNotificationsRead() {
    this.notifications = this.notifications.map(n => ({ ...n, read: true }))
    this.showNotificationsList = false
  }

  // --- Modals Manager ---
  private renderActiveModal() {
    if (!this.activeModal) return ''

    let modalTitle = ''
    let modalBody = html``

    switch (this.activeModal) {
      case 'payment-add':
        modalTitle = 'Input Transaksi Pembayaran'
        modalBody = this.renderPaymentAddForm()
        break
      case 'payment-detail':
        modalTitle = 'Detail Transaksi Pembayaran'
        modalBody = this.renderPaymentDetails()
        break
      case 'user-add':
        modalTitle = 'Tambah Pengguna Baru'
        modalBody = this.renderUserForm(true)
        break
      case 'user-edit':
        modalTitle = 'Edit Data Pengguna'
        modalBody = this.renderUserForm(false)
        break
      case 'class-add':
        modalTitle = 'Buat Kelas Baru'
        modalBody = this.renderClassForm(true)
        break
      case 'class-edit':
        modalTitle = 'Edit Data Kelas'
        modalBody = this.renderClassForm(false)
        break
      case 'class-members':
        modalTitle = `Anggota: ${this.selectedClass?.name}`
        modalBody = this.renderClassMembersList()
        break
      case 'exam-add':
        modalTitle = 'Jadwal Ujian Insidental'
        modalBody = this.renderExamForm(true)
        break
      case 'exam-edit':
        modalTitle = 'Edit Jadwal Ujian'
        modalBody = this.renderExamForm(false)
        break
      case 'expense-add':
        modalTitle = 'Catat Pengeluaran Baru'
        modalBody = this.renderExpenseForm()
        break
      case 'other-income-add':
        modalTitle = 'Catat Pemasukan Baru'
        modalBody = this.renderOtherIncomeForm()
        break
      case 'participant-detail':
        modalTitle = 'Profil & Riwayat Siswa'
        modalBody = this.renderParticipantDetailsModal()
        break
    }

    return html`
      <div class="modal-backdrop" @click=${this.handleBackdropClick}>
        <div class="modal-content">
          <div class="modal-header">
            <h2 style="font-size:18px;">${modalTitle}</h2>
            <button class="modal-close" @click=${() => this.activeModal = null}>
              ${this.iconClose()}
            </button>
          </div>
          ${modalBody}
        </div>
      </div>
    `;
  }

  private renderParticipantDetailsModal() {
    const details = this.selectedParticipantDetail
    if (!details) return html`<p style="padding:20px; text-align:center;">Memuat rincian...</p>`

    const { profile, classes, payments } = details

    return html`
      <div style="max-height: 70vh; overflow-y: auto; padding-right: 4px; text-align:left;">
        <!-- Profile Card -->
        <div class="card" style="margin-bottom:16px;">
          <h3 style="color:var(--primary); margin-bottom:8px; font-size:16px;">${profile.name}</h3>
          <div style="font-size:13px; color:var(--text-muted); display:flex; flex-direction:column; gap:4px;">
            <div>Email: <strong>${profile.email || '-'}</strong></div>
            <div>Telepon: <strong>${profile.phone || '-'}</strong></div>
            <div>Siswa Sejak: <strong>${profile.created_at ? profile.created_at.substring(0,10) : '-'}</strong></div>
          </div>
        </div>

        <!-- Enrolled Classes -->
        <div style="margin-bottom:16px;">
          <h4 style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; color:var(--text-muted); font-weight:700;">Kelas yang Diikuti</h4>
          ${classes.length === 0 ? html`
            <p style="font-size:13px; color:var(--text-muted); font-style:italic;">Belum terdaftar di kelas manapun.</p>
          ` : classes.map((c: any) => html`
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--bg-subtle); border-radius:var(--radius-sm); margin-bottom:6px; font-size:13px; border: 1px solid var(--border);">
              <span style="font-weight:600;">${c.class_name}</span>
              <span class="badge ${c.enrollment_status === 'active' ? 'badge-approved' : 'badge-rejected'}">
                ${c.enrollment_status === 'active' ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
          `)}
        </div>

        <!-- Payment History -->
        <div>
          <h4 style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; color:var(--text-muted); font-weight:700;">Riwayat Transaksi Pembayaran</h4>
          ${payments.length === 0 ? html`
            <p style="font-size:13px; color:var(--text-muted); font-style:italic;">Belum memiliki riwayat pembayaran.</p>
          ` : payments.map((p: any) => html`
            <div style="padding:10px 12px; background:white; border:1px solid var(--border); border-radius:var(--radius-sm); margin-bottom:8px; font-size:12px;">
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="font-weight:700; color:var(--text);">${p.type === 'course' ? 'Iuran: ' + p.class_name : 'Ujian: ' + p.exam_name}</span>
                <span style="font-weight:700; color:var(--primary);">${this.formatRupiah(p.amount)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; color:var(--text-muted);">
                <span>Tgl Bayar: ${p.payment_date}</span>
                <span class="badge ${p.status === 'approved' ? 'badge-approved' : p.status === 'rejected' ? 'badge-rejected' : 'badge-pending'}">
                  ${p.status === 'approved' ? 'Disetujui' : p.status === 'rejected' ? 'Ditolak' : 'Pending'}
                </span>
              </div>
            </div>
          `)}
        </div>
      </div>
    `;
  }

  private handleBackdropClick(e: Event) {
    if (e.target === e.currentTarget) {
      this.activeModal = null
    }
  }

  // --- Modals sub-templates ---

  // 1. Payment Add Form
  @state() private selectedPaymentType: 'course' | 'exam' = 'course'
  @state() private selectedClassForPaymentId = ''

  private renderPaymentAddForm() {
    return html`
      <form @submit=${this.handlePaymentSubmit}>
        <div class="input-group">
          <label class="input-label" for="pay-student">Siswa (Peserta) <span style="color:red;">*</span></label>
          <select class="input-field" id="pay-student" required>
            <option value="">-- Pilih Siswa --</option>
            ${this.participants.map(s => html`<option value=${s.id}>${s.name}</option>`)}
          </select>
        </div>

        <div class="input-group">
          <label class="input-label" for="pay-type">Tipe Pembayaran</label>
          <select class="input-field" id="pay-type" @change=${(e: any) => { this.selectedPaymentType = e.target.value; this.selectedClassForPaymentId = ''; }} required>
            <option value="course">Iuran Bulanan Kelas</option>
            <option value="exam">Ujian Insidental</option>
          </select>
        </div>

        ${this.selectedPaymentType === 'course' ? html`
          <div class="input-group">
            <label class="input-label" for="pay-class">Pilih Kelas</label>
            <select class="input-field" id="pay-class" @change=${(e: any) => this.selectedClassForPaymentId = e.target.value} required>
              <option value="">-- Pilih Kelas --</option>
              ${this.classes.filter(c => c.status === 'active').map(c => html`
                <option value=${c.id}>${c.name} (${this.formatRupiah(c.monthly_fee)})</option>
              `)}
            </select>
          </div>
        ` : html`
          <div class="input-group">
            <label class="input-label" for="pay-exam">Pilih Event Ujian</label>
            <select class="input-field" id="pay-exam" required>
              <option value="">-- Pilih Ujian --</option>
              ${this.examEvents.map(e => html`
                <option value=${e.id}>${e.name} (${this.formatRupiah(e.fee)})</option>
              `)}
            </select>
          </div>
        `}

        <div class="row">
          <div class="input-group">
            <label class="input-label" for="pay-amount">Nominal Transfer (Rp) <span style="color:red;">*</span></label>
            <input class="input-field" type="number" id="pay-amount" placeholder="Contoh: 100000" 
                   @input=${(e: any) => this.updateLivePreviewAmount(e.target.value)} required />
          </div>
          <div class="input-group">
            <label class="input-label" for="pay-date">Tanggal Bayar <span style="color:red;">*</span></label>
            <input class="input-field" type="date" id="pay-date" .value=${new Date().toISOString().split('T')[0]} required />
          </div>
        </div>

        <div class="input-group">
          <label class="input-label" for="pay-receiver">Pembayaran Diterima Oleh <span style="color:red;">*</span></label>
          <select class="input-field" id="pay-receiver" required>
            <option value="">-- Pilih Penerima --</option>
            ${this.users.filter(u => u.is_staff && u.staff_id).map(u => html`
              <option value=${u.staff_id} ?selected=${u.id === this.staff?.user_id}>${u.name}</option>
            `)}
          </select>
        </div>

        <!-- Calculations preview -->
        ${this.liveAmount > 0 ? html`
          <div class="preview-box">
            <div class="preview-row">
              <span>Biaya Admin Agensi:</span>
              <span>${this.adminFeeConfig.enabled ? this.formatRupiah(this.getLivePreviewFee()) : 'Rp 0 (Nonaktif)'}</span>
            </div>
            <div class="preview-row">
              <span>Mukafaah Pengajar (Total Net):</span>
              <span>${this.formatRupiah(Math.max(0, this.liveAmount - this.getLivePreviewFee()))}</span>
            </div>
            <!-- Tutor shares division preview -->
            ${(() => {
              if (this.selectedPaymentType !== 'course' || !this.selectedClassForPaymentId) return ''
              const cls = this.classes.find(c => c.id === this.selectedClassForPaymentId)
              const tutors = cls?.tutors || []
              if (tutors.length === 0) return ''
              const totalNet = Math.max(0, this.liveAmount - this.getLivePreviewFee())
              const sharePerTutor = Math.floor(totalNet / tutors.length)
              return html`
                <div style="font-size:11px; margin-top:8px; border-top:1px dashed rgba(5, 150, 105, 0.2); padding-top:6px; color:var(--primary-hover); text-align:left;">
                  <strong style="display:block; margin-bottom:4px;">Pembagian Mukafaah (${tutors.length} Pengajar):</strong>
                  ${tutors.map(t => html`
                    <div style="display:flex; justify-content:space-between; padding-left:8px; font-weight:normal;">
                      <span>- ${t.name}</span>
                      <span>${this.formatRupiah(sharePerTutor)}</span>
                    </div>
                  `)}
                </div>
              `
            })()}
          </div>
        ` : ''}

        <div class="input-group">
          <label class="input-label" for="pay-file">Bukti Transfer (Gambar/PDF)</label>
          <input class="input-field" type="file" id="pay-file" accept="image/*,application/pdf" />
        </div>

        <div class="input-group">
          <label class="input-label" for="pay-notes">Catatan Tambahan</label>
          <textarea class="input-field" id="pay-notes" rows="2" placeholder="Masukkan keterangan (opsional)"></textarea>
        </div>

        <button type="submit" class="btn btn-primary" style="width:100%; margin-top: 10px;">Simpan & Input Pembayaran</button>
      </form>
    `;
  }

  // 2. Payment Detail View & Verification
  private renderPaymentDetails() {
    const p = this.selectedPayment
    if (!p) return html``

    const isPending = p.status === 'pending'
    const canEdit = this.hasPermission('update')
    const canDelete = this.hasPermission('delete')

    return html`
      <div>
        <div style="margin-bottom: 20px; border-bottom: 1px solid #f3f4f6; padding-bottom: 12px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="badge badge-${p.status}">${p.status === 'approved' ? 'Disetujui' : p.status === 'rejected' ? 'Ditolak' : 'Pending'}</span>
            <span style="font-size:12px; color:var(--text-muted);">${this.formatDate(p.payment_date)}</span>
          </div>
          <h1 style="font-size:20px; margin-top:8px;">${p.participant_name}</h1>
          <p style="font-size:13px; color:var(--text-muted); margin-top:2px;">
            ${p.type === 'course' ? `Iuran Kelas: ${p.class_name}` : `Event Ujian: ${p.exam_name}`}
          </p>
          <p style="font-size:12px; color:var(--text-muted); margin-top:4px;">
            Diterima oleh: <strong style="color:var(--text);">${p.receiver_name || '-'}</strong>
          </p>
        </div>

        <!-- Breakdown Details -->
        <div style="background-color:#f9fafb; border-radius:12px; padding:16px; margin-bottom:16px; font-size:13px; display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between;">
            <span style="color:var(--text-muted);">Nominal Dibayar (Kotor):</span>
            <strong style="color:var(--text);">${this.formatRupiah(p.amount)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:var(--text-muted);">Potongan Biaya Admin:</span>
            <span style="color:#ef4444;">- ${this.formatRupiah(p.admin_fee)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; border-top:1px dashed #e5e7eb; padding-top:8px;">
            <span style="font-weight:600; color:var(--text);">Bersih Disalurkan (Net):</span>
            <strong style="color:var(--secondary); font-size:14px;">${this.formatRupiah(p.net_amount)}</strong>
          </div>
        </div>

        <!-- Distribution details -->
        ${p.status === 'approved' && p.tutor_shares && p.tutor_shares.length > 0 ? html`
          <div class="card" style="margin-bottom:16px; padding:12px; border-color:#e5e7eb;">
            <h4 style="font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">Mukafaah Pengajar</h4>
            <div style="display:flex; flex-direction:column; gap:6px; font-size:12px;">
              ${p.tutor_shares.map(s => html`
                <div style="display:flex; justify-content:space-between;">
                  <span>${s.tutor_name}</span>
                  <span class="badge ${s.status === 'paid' ? 'badge-approved' : 'badge-pending'}" style="font-size:8px; padding:2px 6px;">
                    ${s.status === 'paid' ? 'Paid' : 'Unpaid'}
                  </span>
                  <strong style="color:var(--primary);">${this.formatRupiah(s.amount)}</strong>
                </div>
              `)}
            </div>
          </div>
        ` : p.status === 'pending' && p.type === 'course' ? html`
          <!-- Pending Payment Tutor Shares preview -->
          ${(() => {
            const cls = this.classes.find(c => c.id === p.class_id)
            const tutors = cls?.tutors || []
            if (tutors.length === 0) return ''
            const sharePerTutor = Math.floor(p.net_amount / tutors.length)
            return html`
              <div class="card" style="margin-bottom:16px; padding:12px; border-color:#e5e7eb;">
                <h4 style="font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">Estimasi Mukafaah (${tutors.length} Pengajar)</h4>
                <div style="display:flex; flex-direction:column; gap:6px; font-size:12px;">
                  ${tutors.map(t => html`
                    <div style="display:flex; justify-content:space-between;">
                      <span>${t.name}</span>
                      <strong style="color:var(--primary);">${this.formatRupiah(sharePerTutor)}</strong>
                    </div>
                  `)}
                </div>
              </div>
            `
          })()}
        ` : ''}

        <!-- Attachment details -->
        ${p.attachment_r2_key ? html`
          <div style="margin-bottom:16px;">
            <label class="input-label" style="margin-bottom:6px; display:block;">Bukti Pembayaran</label>
            ${p.attachment_r2_key.toLowerCase().endsWith('.pdf') ? html`
              <a href=${`/api/payments/attachments/${p.attachment_r2_key}`} target="_blank" class="btn btn-secondary" style="width:100%;">
                Buka Berkas PDF Bukti Transfer
              </a>
            ` : html`
              <img class="img-preview" src=${`/api/payments/attachments/${p.attachment_r2_key}`} alt="Bukti Pembayaran" />
              <a href=${`/api/payments/attachments/${p.attachment_r2_key}`} target="_blank" style="font-size:12px; color:var(--primary); font-weight:600; text-decoration:none; display:block; text-align:center;">
                Unduh / Lihat Gambar Penuh
              </a>
            `}
          </div>
        ` : html`
          <div style="text-align:center; padding:16px; background:#f9fafb; border-radius:12px; font-size:12px; color:var(--text-muted); margin-bottom:16px;">
            Tidak ada berkas bukti transfer diunggah.
          </div>
        `}

        <div class="input-group" style="margin-bottom:20px;">
          <label class="input-label">Catatan</label>
          <p style="font-size:13px; color:#374151; background:#f9fafb; padding:10px; border-radius:8px;">
            ${p.notes || 'Tidak ada catatan.'}
          </p>
        </div>

        ${p.status !== 'pending' && p.approved_by_name ? html`
          <div style="font-size:11px; color:var(--text-muted); text-align:right; margin-bottom:16px;">
            Diverifikasi oleh: <strong>${p.approved_by_name}</strong>
          </div>
        ` : ''}

        <!-- Verification Forms -->
        ${isPending && canEdit ? html`
          <div class="card" style="padding:14px; border-color:#e5e7eb; margin-bottom: 16px;">
            <label class="input-label" for="verify-notes">Catatan Verifikasi Staff (Opsional)</label>
            <textarea class="input-field" id="verify-notes" rows="2" style="margin-top:6px;" placeholder="Alasan penolakan atau catatan tambahan"></textarea>
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px;">
              <button class="btn" style="background-color: var(--status-rejected-bg); color: var(--status-rejected);" @click=${() => this.handleVerifyPayment('rejected')}>
                Tolak Pembayaran
              </button>
              <button class="btn btn-primary" @click=${() => this.handleVerifyPayment('approved')}>
                Setujui (Approve)
              </button>
            </div>
          </div>
        ` : ''}

        <!-- Delete options -->
        ${canDelete ? html`
          <button class="btn btn-danger" style="width:100%; border:1px solid #fee2e2;" @click=${() => this.handleDeletePayment(p.id)}>
            ${this.iconTrash()} Hapus Transaksi Ini
          </button>
        ` : ''}
      </div>
    `;
  }

  // 3. User Add/Edit Form
  @state() private isStaffSelected = false

  private renderUserForm(isAdd: boolean) {
    const u = isAdd ? null : this.selectedUser
    
    return html`
      <form @submit=${this.handleUserSubmit}>
        <div class="input-group">
          <label class="input-label" for="user-name">Nama Lengkap <span style="color:red;">*</span></label>
          <input class="input-field" type="text" id="user-name" .value=${u?.name || ''} placeholder="Contoh: Ahmad Fauzi" required />
        </div>

        <div class="row">
          <div class="input-group">
            <label class="input-label" for="user-email">Email</label>
            <input class="input-field" type="email" id="user-email" .value=${u?.email || ''} placeholder="ahmad@email.com" />
          </div>
          <div class="input-group">
            <label class="input-label" for="user-phone">No. Handphone (WhatsApp)</label>
            <input class="input-field" type="tel" id="user-phone" .value=${u?.phone || ''} placeholder="0812XXXXXXXX" />
          </div>
        </div>

        <div style="background:#f9fafb; border-radius:12px; padding:12px; margin-bottom:16px;">
          <label class="input-label" style="margin-bottom:8px; display:block;">Peran / Role Pengguna</label>
          
          <div class="checkbox-group">
            <input type="checkbox" id="user-is-participant" .checked=${u?.is_participant || false} />
            <label for="user-is-participant" style="font-size:13px;">Peserta (Siswa Pembaca Al-Quran)</label>
          </div>
          
          <div class="checkbox-group">
            <input type="checkbox" id="user-is-tutor" .checked=${u?.is_tutor || false} />
            <label for="user-is-tutor" style="font-size:13px;">Pengajar / Guru (Tutor)</label>
          </div>
          
          <div class="checkbox-group">
            <input type="checkbox" id="user-is-staff" .checked=${u?.is_staff || false} 
                   @change=${(e: any) => this.isStaffSelected = e.target.checked} />
            <label for="user-is-staff" style="font-size:13px; font-weight:600;">Staff Agensi (Bisa Login)</label>
          </div>
        </div>

        <!-- Staff Credentials block -->
        ${this.isStaffSelected ? html`
          <div class="card" style="border-color:var(--primary); padding:16px; background-color: var(--primary-light); margin-bottom:16px;">
            <h4 style="font-size:12px; color:var(--primary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">Kredensial Staff</h4>
            
            <div class="input-group">
              <label class="input-label" for="user-username">Nama Pengguna (Username) <span style="color:red;">*</span></label>
              <input class="input-field" type="text" id="user-username" .value=${u?.username || ''} placeholder="Masukkan username login" required />
            </div>

            <div class="input-group">
              <label class="input-label" for="user-password">Kata Sandi (Password) ${isAdd ? html`<span style="color:red;">*</span>` : '(Kosongkan jika tidak diubah)'}</label>
              <input class="input-field" type="password" id="user-password" placeholder="Masukkan password" ?required=${isAdd} />
            </div>

            <label class="input-label" style="margin-bottom:8px; display:block;">Izin Hak Akses</label>
            <div style="display:flex; gap:12px; flex-wrap:wrap;">
              <div class="checkbox-group">
                <input type="checkbox" id="perm-create" .checked=${u?.permissions?.includes('create') || true} />
                <label for="perm-create" style="font-size:12px; font-weight:600;">Create (Tambah)</label>
              </div>
              <div class="checkbox-group">
                <input type="checkbox" id="perm-update" .checked=${u?.permissions?.includes('update') || false} />
                <label for="perm-update" style="font-size:12px; font-weight:600;">Update (Edit & Setujui)</label>
              </div>
              <div class="checkbox-group">
                <input type="checkbox" id="perm-delete" .checked=${u?.permissions?.includes('delete') || false} />
                <label for="perm-delete" style="font-size:12px; font-weight:600;">Delete (Hapus)</label>
              </div>
            </div>
          </div>
        ` : ''}

        <button type="submit" class="btn btn-primary" style="width:100%;">${isAdd ? 'Tambah Pengguna' : 'Simpan Perubahan'}</button>
      </form>
    `;
  }

  // 4. Class Add/Edit Form
  private renderClassForm(isAdd: boolean) {
    const c = isAdd ? null : this.selectedClass
    const selectedTutorIds = c?.tutors.map(t => t.id) || []

    return html`
      <form @submit=${this.handleClassSubmit}>
        <div class="input-group">
          <label class="input-label" for="class-name">Nama Kelas <span style="color:red;">*</span></label>
          <input class="input-field" type="text" id="class-name" .value=${c?.name || ''} placeholder="Contoh: Tahsin Quran - Sore" required />
        </div>

        <div class="input-group">
          <label class="input-label" for="class-description">Keterangan / Deskripsi</label>
          <input class="input-field" type="text" id="class-description" .value=${c?.description || ''} placeholder="Contoh: Setiap hari Selasa & Kamis" />
        </div>

        <div class="row">
          <div class="input-group">
            <label class="input-label" for="class-fee">Biaya Bulanan (Rp) <span style="color:red;">*</span></label>
            <input class="input-field" type="number" id="class-fee" .value=${c?.monthly_fee || 0} placeholder="Contoh: 150000" required />
          </div>
          <div class="input-group">
            <label class="input-label" for="class-status">Status Kelas</label>
            <select class="input-field" id="class-status" required>
              <option value="active" ?selected=${c?.status === 'active'}>Aktif</option>
              <option value="inactive" ?selected=${c?.status === 'inactive'}>Nonaktif</option>
            </select>
          </div>
        </div>

        <div class="checkbox-group" style="margin-bottom:16px; margin-top:8px;">
          <input type="checkbox" id="class-admin-fee" .checked=${c ? c.has_admin_fee !== 0 : true} />
          <label for="class-admin-fee" style="font-size:13px; font-weight:600;">Terapkan Biaya Admin (Admin Fee)</label>
        </div>

        <div class="card" style="padding:14px; border-color:#e5e7eb; margin-bottom:16px;">
          <label class="input-label" style="margin-bottom:8px; display:block;">Pilih Pengajar (Tutors) Kelas</label>
          ${this.tutors.length === 0 ? html`
            <p style="font-size:12px; color:var(--text-muted);">Belum ada tutor terdaftar. Daftarkan tutor dahulu di Pengguna.</p>
          ` : html`
            <div style="display:flex; flex-direction:column; gap:8px; max-height: 120px; overflow-y:auto;">
              ${this.tutors.map(t => html`
                <div class="checkbox-group" style="margin-bottom:4px;">
                  <input type="checkbox" class="class-tutor-check" value=${t.id} .checked=${selectedTutorIds.includes(t.id)} id=${`tcb-${t.id}`} />
                  <label for=${`tcb-${t.id}`} style="font-size:13px;">${t.name}</label>
                </div>
              `)}
            </div>
          `}
        </div>

        <button type="submit" class="btn btn-primary" style="width:100%;">${isAdd ? 'Buat Kelas' : 'Simpan Perubahan'}</button>
      </form>
    `;
  }

  // 5. Class Members Management View
  private renderClassMembersList() {
    return html`
      <div>
        <!-- Month Filter for Payment Status -->
        <div style="display:flex; align-items:center; justify-content:space-between; background-color:var(--bg-subtle); border-radius:12px; padding:10px; margin-bottom:16px; border: 1px solid var(--border-dark);">
          <span style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Cek Iuran Bulan:</span>
          <input class="input-field" type="month" id="member-payment-month" 
                 .value=${this.classMemberPaymentMonth} 
                 @input=${(e: any) => this.classMemberPaymentMonth = e.target.value} 
                 style="width: 160px; padding: 6px 10px; font-size: 13px; background-color:#ffffff;" />
        </div>

        <!-- Add student form -->
        ${this.hasPermission('create') ? html`
          <form class="card" style="padding:12px; border-color:#e5e7eb; margin-bottom:16px;" @submit=${this.handleAddClassMember}>
            <label class="input-label" for="add-member-select">Daftarkan Siswa Baru ke Kelas</label>
            <div style="display:flex; gap:8px; margin-top:6px;">
              <select class="input-field" id="add-member-select" style="flex:1;" required>
                <option value="">-- Pilih Siswa --</option>
                ${this.participants.map(p => html`<option value=${p.id}>${p.name}</option>`)}
              </select>
              <button type="submit" class="btn btn-primary" style="padding:8px 16px; font-size:12px;">+ Daftarkan</button>
            </div>
          </form>
        ` : ''}

        <!-- Members list -->
        <h4 style="font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">Anggota Kelas & Status Iuran</h4>
        <div style="display:flex; flex-direction:column; gap:8px; max-height:300px; overflow-y:auto; padding-right:2px;">
          ${this.selectedClassMembers.length === 0 ? html`
            <p style="text-align:center; padding:20px; font-size:13px; color:var(--text-muted);">Belum ada siswa terdaftar di kelas ini.</p>
          ` : this.selectedClassMembers.map(m => {
            const payment = this.payments.find(p => 
              p.participant_id === m.participant_id && 
              p.class_id === this.selectedClass?.id && 
              p.status === 'approved' && 
              p.payment_date.substring(0, 7) === this.classMemberPaymentMonth
            )

            return html`
              <div style="border:1px solid #f3f4f6; border-radius:12px; padding:10px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <strong style="font-size:13px; color:var(--text);">${m.name}</strong>
                    ${payment ? html`
                      <span class="badge" style="background-color:var(--status-approved-bg); color:var(--status-approved); font-size:10px; padding: 2px 6px;">
                        Lunas
                      </span>
                    ` : html`
                      <span class="badge" style="background-color:#fee2e2; color:#ef4444; font-size:10px; padding: 2px 6px;">
                        Belum Lunas
                      </span>
                    `}
                  </div>
                  <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">
                    Telp: ${m.phone || '-'} ${payment ? `| Tgl Bayar: ${this.formatDate(payment.payment_date)}` : ''}
                  </div>
                </div>
                
                <div style="display:flex; align-items:center; gap:6px;">
                  <button class="btn" style="padding:4px 8px; font-size:10px; background-color:${m.status === 'active' ? 'var(--status-approved-bg)' : '#f3f4f6'}; color:${m.status === 'active' ? 'var(--status-approved)' : '#6b7280'};"
                          @click=${() => this.handleToggleMemberStatus(m)}>
                    ${m.status === 'active' ? 'Aktif' : 'Nonaktif'}
                  </button>
                  ${this.hasPermission('delete') ? html`
                    <button class="btn btn-danger" style="padding:6px; background-color:#fee2e2;" @click=${() => this.handleDeleteClassMember(m.participant_id)}>
                      ${this.iconClose()}
                    </button>
                  ` : ''}
                </div>
              </div>
            `
          })}
        </div>
      </div>
    `;
  }

  // 6. Exam Event Add/Edit Form
  private renderExamForm(isAdd: boolean) {
    const e = isAdd ? null : this.selectedExam

    return html`
      <form @submit=${this.handleExamSubmit}>
        <div class="input-group">
          <label class="input-label" for="exam-name">Nama Ujian <span style="color:red;">*</span></label>
          <input class="input-field" type="text" id="exam-name" .value=${e?.name || ''} placeholder="Contoh: Ujian Kenaikan Jilid 3" required />
        </div>

        <div class="input-group">
          <label class="input-label" for="exam-class-id">Hubungkan dengan Kelas (Opsional)</label>
          <select class="input-field" id="exam-class-id">
            <option value="">-- Terbuka Umum / Semua Kelas --</option>
            ${this.classes.map(c => html`
              <option value=${c.id} ?selected=${e?.class_id === c.id}>${c.name}</option>
            `)}
          </select>
        </div>

        <div class="input-group">
          <label class="input-label" for="exam-fee">Biaya Pendaftaran Ujian (Rp) <span style="color:red;">*</span></label>
          <input class="input-field" type="number" id="exam-fee" .value=${e?.fee || 0} placeholder="Contoh: 50000" required />
        </div>

        <div class="row">
          <div class="input-group">
            <label class="input-label" for="exam-start-date">Tanggal Mulai <span style="color:red;">*</span></label>
            <input class="input-field" type="date" id="exam-start-date" .value=${e?.start_date || ''} required />
          </div>
          <div class="input-group">
            <label class="input-label" for="exam-end-date">Tanggal Selesai <span style="color:red;">*</span></label>
            <input class="input-field" type="date" id="exam-end-date" .value=${e?.end_date || ''} required />
          </div>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%; margin-top:10px;">${isAdd ? 'Jadwalkan Ujian' : 'Simpan Perubahan'}</button>
      </form>
    `;
  }

  // Expenses management helper actions & views
  private renderExpenseForm() {
    const today = new Date().toISOString().substring(0, 10)
    return html`
      <form @submit=${this.handleExpenseSubmit}>
        <div class="input-group">
          <label class="input-label" for="expense-desc">Deskripsi Pengeluaran <span style="color:red;">*</span></label>
          <input class="input-field" type="text" id="expense-desc" placeholder="Contoh: Biaya Listrik Bulanan / Biaya Internet WiFi" required />
        </div>

        <div class="input-group">
          <label class="input-label" for="expense-amount">Nominal Pengeluaran (Rp) <span style="color:red;">*</span></label>
          <input class="input-field" type="number" id="expense-amount" placeholder="Contoh: 150000" min="1" required />
        </div>

        <div class="input-group">
          <label class="input-label" for="expense-date">Tanggal Pengeluaran <span style="color:red;">*</span></label>
          <input class="input-field" type="date" id="expense-date" .value=${today} required />
        </div>

        <div class="input-group">
          <label class="input-label" for="expense-attachment">Bukti Pengeluaran (Lampiran Gambar/PDF)</label>
          <input class="input-field" type="file" id="expense-attachment" accept="image/*,application/pdf" />
        </div>

        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
          <button type="button" class="btn btn-secondary" style="padding:10px 16px;" @click=${() => this.activeModal = null}>Batal</button>
          <button type="submit" class="btn btn-primary" style="padding:10px 16px;">Simpan Pengeluaran</button>
        </div>
      </form>
    `;
  }

  private async handleExpenseSubmit(e: Event) {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const amountInput = form.querySelector('#expense-amount') as HTMLInputElement
    const descInput = form.querySelector('#expense-desc') as HTMLInputElement
    const dateInput = form.querySelector('#expense-date') as HTMLInputElement
    const attachmentInput = form.querySelector('#expense-attachment') as HTMLInputElement

    const amount = parseInt(amountInput.value, 10)
    const description = descInput.value.trim()
    const expense_date = dateInput.value
    const file = attachmentInput.files ? attachmentInput.files[0] : null

    if (!amount || !description || !expense_date) {
      this.showToast('Mohon lengkapi semua field', 'error')
      return
    }

    const formData = new FormData()
    formData.append('amount', amount.toString())
    formData.append('description', description)
    formData.append('expense_date', expense_date)
    if (file) {
      formData.append('attachment', file)
    }

    this.loading = true
    try {
      await this.fetchApi('/api/expenses', {
        method: 'POST',
        body: formData
      })
      this.showToast('Pengeluaran berhasil dicatat', 'success')
      this.activeModal = null
      this.loadExpenses()
      this.loadDashboardStats()
    } catch(err: any) {
      this.showToast(err.message || 'Gagal mencatat pengeluaran', 'error')
    } finally {
      this.loading = false
    }
  }

  private async handleDeleteExpense(id: string) {
    if (!confirm('Apakah Anda yakin ingin menghapus pengeluaran ini?')) return
    this.loading = true
    try {
      await this.fetchApi(`/api/expenses/${id}`, { method: 'DELETE' })
      this.showToast('Pengeluaran berhasil dihapus', 'success')
      this.loadExpenses()
      this.loadDashboardStats()
    } catch(e: any) {
      this.showToast(e.message || 'Gagal menghapus pengeluaran', 'error')
    } finally {
      this.loading = false
    }
  }

  private async loadExpenses() {
    try {
      this.expenses = await this.fetchApi('/api/expenses')
    } catch(e) {}
  }

  private renderOtherIncomeForm() {
    const today = new Date().toISOString().substring(0, 10)
    return html`
      <form @submit=${this.handleOtherIncomeSubmit}>
        <div class="input-group">
          <label class="input-label" for="other-income-category">Kategori Pemasukan <span style="color:red;">*</span></label>
          <select class="input-field" id="other-income-category" required>
            <option value="Saldo Kas Awal">Saldo Kas Awal</option>
            <option value="Donasi">Donasi</option>
            <option value="Hibah">Hibah</option>
            <option value="Hadiah">Hadiah</option>
            <option value="Lainnya">Lainnya</option>
          </select>
        </div>

        <div class="input-group">
          <label class="input-label" for="other-income-desc">Keterangan <span style="color:red;">*</span></label>
          <input class="input-field" type="text" id="other-income-desc" placeholder="Contoh: Donasi dari Hamba Allah" required />
        </div>

        <div class="input-group">
          <label class="input-label" for="other-income-amount">Nominal Pemasukan (Rp) <span style="color:red;">*</span></label>
          <input class="input-field" type="number" id="other-income-amount" placeholder="Contoh: 500000" min="1" required />
        </div>

        <div class="input-group">
          <label class="input-label" for="other-income-date">Tanggal Pemasukan <span style="color:red;">*</span></label>
          <input class="input-field" type="date" id="other-income-date" .value=${today} required />
        </div>

        <div class="input-group">
          <label class="input-label" for="other-income-attachment">Bukti Pemasukan (Lampiran Gambar/PDF)</label>
          <input class="input-field" type="file" id="other-income-attachment" accept="image/*,application/pdf" />
        </div>

        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
          <button type="button" class="btn btn-secondary" style="padding:10px 16px;" @click=${() => this.activeModal = null}>Batal</button>
          <button type="submit" class="btn btn-primary" style="padding:10px 16px;">Simpan Pemasukan</button>
        </div>
      </form>
    `;
  }

  private async handleOtherIncomeSubmit(e: Event) {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const amountInput = form.querySelector('#other-income-amount') as HTMLInputElement
    const categorySelect = form.querySelector('#other-income-category') as HTMLSelectElement
    const descInput = form.querySelector('#other-income-desc') as HTMLInputElement
    const dateInput = form.querySelector('#other-income-date') as HTMLInputElement
    const attachmentInput = form.querySelector('#other-income-attachment') as HTMLInputElement

    const amount = parseInt(amountInput.value, 10)
    const category = categorySelect.value
    const description = descInput.value.trim()
    const income_date = dateInput.value
    const file = attachmentInput.files ? attachmentInput.files[0] : null

    if (!amount || !category || !description || !income_date) {
      this.showToast('Mohon lengkapi semua field', 'error')
      return
    }

    const formData = new FormData()
    formData.append('amount', amount.toString())
    formData.append('category', category)
    formData.append('description', description)
    formData.append('income_date', income_date)
    if (file) {
      formData.append('attachment', file)
    }

    this.loading = true
    try {
      await this.fetchApi('/api/other-incomes', {
        method: 'POST',
        body: formData
      })
      this.showToast('Pemasukan berhasil dicatat', 'success')
      this.activeModal = null
      this.loadOtherIncomes()
      this.loadDashboardStats()
    } catch(err: any) {
      this.showToast(err.message || 'Gagal mencatat pemasukan', 'error')
    } finally {
      this.loading = false
    }
  }

  private async handleDeleteOtherIncome(id: string) {
    if (!confirm('Apakah Anda yakin ingin menghapus pemasukan ini?')) return
    this.loading = true
    try {
      await this.fetchApi(`/api/other-incomes/${id}`, { method: 'DELETE' })
      this.showToast('Pemasukan berhasil dihapus', 'success')
      this.loadOtherIncomes()
      this.loadDashboardStats()
    } catch(e: any) {
      this.showToast(e.message || 'Gagal menghapus pemasukan', 'error')
    } finally {
      this.loading = false
    }
  }

  private async loadOtherIncomes() {
    try {
      this.otherIncomes = await this.fetchApi('/api/other-incomes')
    } catch(e) {}
  }

  private exportCashflowToPDF() {
    const r = this.cashflowReportData
    const month = this.selectedReportMonth
    if (!r) {
      this.showToast('Tidak ada data untuk diekspor', 'error')
      return
    }

    const printWindow = window.open('', '_blank', 'width=900,height=800')
    if (!printWindow) {
      this.showToast('Gagal membuka jendela cetak. Pastikan pop-up diizinkan.', 'error')
      return
    }

    const logoUrl = window.location.origin + '/logo.jpg'
    const periodStr = this.formatMonthName(month)
    const currentDate = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })

    const inflowsHtml = r.inflows.map((item: any, idx: number) => `
      <tr>
        <td style="text-align: center; border: 1px solid #e5e7eb; padding: 8px;">${idx + 1}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${this.formatDate(item.payment_date)}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px; font-weight: 600;">${item.participant_name}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${item.type === 'course' ? `Kelas: ${item.class_name}` : `Ujian: ${item.exam_name}`}</td>
        <td style="text-align: right; border: 1px solid #e5e7eb; padding: 8px; font-weight: 700; color: #8ba296;">+${this.formatRupiah(item.amount)}</td>
      </tr>
    `).join('')

    const otherInflowsHtml = (r.other_inflows || []).map((item: any, idx: number) => `
      <tr>
        <td style="text-align: center; border: 1px solid #e5e7eb; padding: 8px;">${idx + 1}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${this.formatDate(item.payment_date)}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px; font-weight: 600;">${item.participant_name}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${item.class_name}</td>
        <td style="text-align: right; border: 1px solid #e5e7eb; padding: 8px; font-weight: 700; color: #22c55e;">+${this.formatRupiah(item.amount)}</td>
      </tr>
    `).join('')

    const outflowsHtml = r.outflows.map((item: any, idx: number) => `
      <tr>
        <td style="text-align: center; border: 1px solid #e5e7eb; padding: 8px;">${idx + 1}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${this.formatDate(item.expense_date)}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px; font-weight: 600;">${item.description}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${item.created_by_name || 'Staff'}</td>
        <td style="text-align: right; border: 1px solid #e5e7eb; padding: 8px; font-weight: 700; color: #ef4444;">-${this.formatRupiah(item.amount)}</td>
      </tr>
    `).join('')

    const mukafaahHtml = (r.mukafaah_outflows || []).map((item: any, idx: number) => `
      <tr>
        <td style="text-align: center; border: 1px solid #e5e7eb; padding: 8px;">${idx + 1}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${this.formatDate(item.expense_date)}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px; font-weight: 600; color: #5b21b6;">${item.description}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${item.created_by_name || 'Sistem'}</td>
        <td style="text-align: right; border: 1px solid #e5e7eb; padding: 8px; font-weight: 700; color: #5b21b6;">-${this.formatRupiah(item.amount)}</td>
      </tr>
    `).join('')

    printWindow.document.write(`
      <html>
        <head>
          <title>Laporan Arus Kas - ${periodStr}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
            body {
              font-family: 'Outfit', sans-serif;
              color: #1f2937;
              margin: 0;
              padding: 40px;
              line-height: 1.5;
            }
            .header-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 24px;
            }
            .logo-img {
              height: 60px;
              width: auto;
            }
            .divider {
              border-top: 3px double #c3a64d;
              margin: 20px 0;
            }
            .report-title {
              font-size: 20px;
              font-weight: 700;
              text-align: center;
              color: #c3a64d;
              text-transform: uppercase;
              margin-bottom: 20px;
              letter-spacing: 0.8px;
            }
            .summary-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 24px;
              font-size: 13px;
            }
            .summary-table td {
              border: 1px solid #e5e7eb;
              padding: 10px 12px;
            }
            .summary-label {
              font-weight: 600;
              color: #4b5563;
              background-color: #f9fafb;
            }
            .summary-value {
              font-weight: 700;
              text-align: right;
            }
            .section-title {
              font-size: 14px;
              font-weight: 700;
              margin: 20px 0 8px 0;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .report-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 16px;
              font-size: 12px;
            }
            .report-table th {
              background-color: #f7f5ee;
              color: #c3a64d;
              border: 1px solid #e5e7eb;
              padding: 10px 8px;
              font-weight: 700;
              text-transform: uppercase;
              font-size: 10px;
              letter-spacing: 0.5px;
            }
            .signature-section {
              margin-top: 50px;
              width: 100%;
              font-size: 13px;
            }
            @media print {
              body {
                padding: 20px;
              }
            }
          </style>
        </head>
        <body>
          <table class="header-table">
            <tr>
              <td>
                <img class="logo-img" src="${logoUrl}" alt="Al-Mumtaz Logo" />
              </td>
              <td style="text-align: right; font-size: 12px; color: #6b7280; line-height: 1.4;">
                <strong style="color: #c3a64d; font-size: 16px;">Rumah Qur'an Al-Mumtaz</strong><br />
                Lembaga Pelatihan & Pembacaan Al-Quran E-Learning<br />
                Email: info@almumtaz.sch.id | Web: fragrant-surf-ea74.awanio.workers.dev
              </td>
            </tr>
          </table>

          <div class="divider"></div>

          <div class="report-title">Laporan Aliran Arus Kas (Kas Buku Utama)</div>

          <div style="font-size: 13px; margin-bottom: 12px; color: #4b5563;">
            <strong>Periode Laporan:</strong> ${periodStr} <br />
            <strong>Tanggal Cetak:</strong> ${currentDate} <br />
            <strong>Dicetak Oleh:</strong> ${this.staff?.name || 'Administrator'}
          </div>

          <table class="summary-table">
            <tr>
              <td class="summary-label">Saldo Awal (Sebelum Bulan Ini)</td>
              <td class="summary-value" style="color: #4b5563;">${this.formatRupiah(r.starting_balance)}</td>
            </tr>
            <tr>
              <td class="summary-label" style="color: #8ba296;">Total Pemasukan Iuran & Ujian</td>
              <td class="summary-value" style="color: #8ba296;">+${this.formatRupiah(r.total_payments_inflow)}</td>
            </tr>
            <tr>
              <td class="summary-label" style="color: #22c55e;">Total Pemasukan Kas Lainnya</td>
              <td class="summary-value" style="color: #22c55e;">+${this.formatRupiah(r.total_other_inflow)}</td>
            </tr>
            <tr>
              <td class="summary-label" style="color: #0d9488;">Total Pemasukan Keseluruhan</td>
              <td class="summary-value" style="color: #0d9488;">+${this.formatRupiah(r.total_inflow)}</td>
            </tr>
            <tr>
              <td class="summary-label" style="color: #ef4444;">Total Pengeluaran Kas & Mukafaah</td>
              <td class="summary-value" style="color: #ef4444;">-${this.formatRupiah(r.total_outflow)}</td>
            </tr>
            <tr style="font-size: 15px; border-top: 2px solid #c3a64d;">
              <td class="summary-label" style="color: #c3a64d; background-color: #fdfbf7;">Saldo Akhir Bersih (Kas Tersedia)</td>
              <td class="summary-value" style="color: #c3a64d; background-color: #fdfbf7;">${this.formatRupiah(r.ending_balance)}</td>
            </tr>
          </table>

          <div class="section-title" style="color: #8ba296;">Rincian Aliran Masuk (Iuran Siswa & Ujian)</div>
          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 30px;">No</th>
                <th style="width: 100px;">Tanggal</th>
                <th>Nama Siswa</th>
                <th>Keterangan</th>
                <th style="width: 130px; text-align: right;">Nominal</th>
              </tr>
            </thead>
            <tbody>
              ${r.inflows.length === 0 ? `<tr><td colspan="5" style="text-align: center; color: #6b7280; padding: 10px;">Tidak ada pemasukan kas.</td></tr>` : inflowsHtml}
            </tbody>
          </table>

          <div class="section-title" style="color: #22c55e;">Rincian Aliran Masuk (Pemasukan Lainnya)</div>
          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 30px;">No</th>
                <th style="width: 100px;">Tanggal</th>
                <th>Kategori</th>
                <th>Keterangan</th>
                <th style="width: 130px; text-align: right;">Nominal</th>
              </tr>
            </thead>
            <tbody>
              ${!r.other_inflows || r.other_inflows.length === 0 ? `<tr><td colspan="5" style="text-align: center; color: #6b7280; padding: 10px;">Tidak ada pemasukan kas lainnya.</td></tr>` : otherInflowsHtml}
            </tbody>
          </table>

          <div class="section-title" style="color: #ef4444;">Rincian Aliran Keluar (Pengeluaran Kas)</div>
          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 30px;">No</th>
                <th style="width: 100px;">Tanggal</th>
                <th>Keterangan Item</th>
                <th>Dicatat Oleh</th>
                <th style="width: 130px; text-align: right;">Nominal</th>
              </tr>
            </thead>
            <tbody>
              ${r.outflows.length === 0 ? `<tr><td colspan="5" style="text-align: center; color: #6b7280; padding: 10px;">Tidak ada pengeluaran kas.</td></tr>` : outflowsHtml}
            </tbody>
          </table>

          <div class="section-title" style="color: #5b21b6;">Rincian Aliran Keluar (Mukafaah Pengajar)</div>
          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 30px;">No</th>
                <th style="width: 100px;">Tanggal</th>
                <th>Keterangan</th>
                <th>Pencatat</th>
                <th style="width: 130px; text-align: right;">Nominal</th>
              </tr>
            </thead>
            <tbody>
              ${!r.mukafaah_outflows || r.mukafaah_outflows.length === 0 ? `<tr><td colspan="5" style="text-align: center; color: #6b7280; padding: 10px;">Tidak ada pengeluaran mukafaah pengajar.</td></tr>` : mukafaahHtml}
            </tbody>
          </table>

          <table class="signature-section">
            <tr>
              <td style="width: 60%;"></td>
              <td style="text-align: center;">
                <p style="margin-bottom: 50px; color: #4b5563;">Mengetahui,<br /><strong>Kepala Administrasi Rumah Qur'an</strong></p>
                <strong style="text-decoration: underline; color: #1f2937;">${this.staff?.name || 'Mika Dwi Indah'}</strong><br />
                <span style="font-size: 11px; color: #6b7280; font-weight: 500;">Staff Admin Utama</span>
              </td>
            </tr>
          </table>

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }
}
