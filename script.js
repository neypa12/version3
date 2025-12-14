// =========================================================
// A. 1. CONFIGURACIÓN DE FIREBASE (¡REEMPLAZA ESTO CON TUS CLAVES REALES!)
// =========================================================

const firebaseConfig = {
    apiKey: "AIzaSyD_3G97nMH91Cin7rvkMr5FZ5C76NLDCY0", // <--- PEGA TU apiKey REAL
    authDomain: "monopoliobank.firebaseapp.com", // <--- PEGA TU authDomain REAL
    projectId: "monopoliobank", // <--- PEGA TU projectId REAL
    storageBucket: "monopoliobank.firebasestorage.app", // <--- PEGA TU storageBucket REAL
    messagingSenderId: "918026032724", // <--- PEGA TU messagingSenderId REAL
    appId: "1:918026032724:web:7d63bda8bba719cd02ffc1" // <--- PEGA TU appId REAL
};

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// =========================================================
// 2. VARIABLES GLOBALES
// =========================================================
let CURRENT_PLAYER_ID = null; 
const SALARY_AMOUNT = 200;
const INITIAL_BALANCE = 1500; 
const LOAN_INTEREST_RATE = 0.10; // 10% de interés
let allPlayersCache = []; 
let selectedPlayerForLogin = { id: null, name: null }; 
let currentAction = { type: null, targetId: null, targetName: null }; // Para manejo de acciones

// =========================================================
// CÓDIGO PRINCIPAL: ASEGURAR QUE EL DOM ESTÉ CARGADO
// =========================================================

document.addEventListener('DOMContentLoaded', () => {

    // =========================================================
    // 3. CACHÉ DE ELEMENTOS DEL DOM
    // =========================================================
     
    // Elementos de la interfaz dinámica 
    const dynamicActionArea = document.getElementById('dynamic-action-area');
    const actionTitle = document.getElementById('action-title');
    const amountInput = document.getElementById('dynamic-amount-input');
    const executeButton = document.getElementById('execute-action-button');
    const statusMessage = document.getElementById('status-message');

    // Elementos de la interfaz de PIN
    const pinEntryArea = document.getElementById('pin-entry-area');
    const pinTitle = document.getElementById('pin-title');
    const pinInput = document.getElementById('pin-input');
    const submitPinButton = document.getElementById('submit-pin-button');
    const pinStatusMessage = document.getElementById('pin-status-message');
     
    // Botones globales
    const logoutButton = document.getElementById('logout-button');
    const resetButton = document.getElementById('reset-game-button');
    const backButton = document.getElementById('back-to-player-select-button');
    const salaryButton = document.getElementById('salary-button');
    const bankReceiveButton = document.getElementById('bank-receive-button');
    // NUEVOS BOTONES DE PRÉSTAMO
    const requestLoanButton = document.getElementById('request-loan-button');
    const payLoanButton = document.getElementById('pay-loan-button');


    // =========================================================
    // 4. FUNCIONES ASÍNCRONAS Y DE UTILERÍA
    // =========================================================

    async function fetchAllPlayers() {
        const snapshot = await db.collection("players").get();
        allPlayersCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return allPlayersCache;
    }
     
    function generateTwoDigitPin() {
        return String(Math.floor(10 + Math.random() * 90)); // Genera un número entre 10 y 99
    }
     
    // FUNCIÓN DE TRANSACCIÓN GENERAL (PAGAR A JUGADOR/BANCO) - CORREGIDA
    async function performTransaction(senderId, recipientId, amount, type = 'TRANSFER', description = null) {
        if (amount <= 0) return alert("El monto debe ser positivo.");

        const senderRef = db.collection('players').doc(senderId);
        const recipientRef = db.collection('players').doc(recipientId);

        executeButton.disabled = true; 
        let transactionData = {};

        try {
            await db.runTransaction(async (transaction) => {
                 
                const senderDoc = await transaction.get(senderRef);
                const recipientDoc = await transaction.get(recipientRef);
                 
                // Si el remitente es un jugador, verificar saldo
                if (senderId === CURRENT_PLAYER_ID) { 
                    if (senderDoc.data().balance < amount) {
                        throw "Saldo insuficiente.";
                    }
                }
                if (!recipientDoc.exists) {
                    throw "El jugador que recibe no existe.";
                }

                // Actualizar saldo del remitente (solo si no es el banco)
                if (senderId !== 'bank') {
                    const newSenderBalance = senderDoc.data().balance - amount;
                    transaction.update(senderRef, { balance: newSenderBalance });
                }

                // Actualizar saldo del receptor
                const newRecipientBalance = (recipientDoc.data().balance || 0) + amount;
                transaction.update(recipientRef, { balance: newRecipientBalance });
                
                // Preparar los datos de la transacción
                transactionData = {
                    sender: senderId,
                    recipient: recipientId,
                    amount: amount,
                    type: type,
                    description: description || `${senderId} pagó a ${recipientId}`
                };
            });
            
            // REGISTRAR TRANSACCIÓN (FUERA DE LA TRANSACCIÓN DE LECTURA/ESCRITURA) - CORRECCIÓN CLAVE
            await db.collection("transactions").add({
                ...transactionData,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log("Transacción completada con éxito.");

        } catch (e) {
            console.error("Fallo de Transacción:", e);
            if (e === "Saldo insuficiente.") {
                alert(e);
            } else {
                alert(`Error en la transacción: ${e.message || e}`);
            }
             
        } finally {
            executeButton.disabled = false; 
        }
    }
     
    // NUEVA FUNCIÓN: Lógica para Pedir Préstamo - CORREGIDA
    async function performLoanTransaction(playerId, amount) {
        if (amount <= 0) return alert("El monto debe ser positivo.");

        const playerRef = db.collection('players').doc(playerId);
        executeButton.disabled = true;
        let debtAmount = 0;
        let transactionData = {};

        try {
            await db.runTransaction(async (transaction) => {
                const playerDoc = await transaction.get(playerRef);
                const data = playerDoc.data();
                 
                debtAmount = amount * (1 + LOAN_INTEREST_RATE); // Monto + 10% de interés
                 
                // Actualizar Saldo y Deuda (Asegurando inicialización a 0 si es null/undefined)
                const newBalance = (data.balance || 0) + amount;
                const newDebt = (data.deuda || 0) + debtAmount;
                 
                transaction.update(playerRef, { balance: newBalance, deuda: newDebt });
                 
                // Preparar los datos de la transacción
                transactionData = {
                    sender: 'bank',
                    recipient: playerId,
                    amount: amount,
                    type: 'LOAN_REQUEST',
                    description: `Préstamo: $${amount.toFixed(0)}. Deuda adquirida: $${debtAmount.toFixed(2)} (10% interés)`,
                };
            });
            
            // REGISTRAR TRANSACCIÓN (FUERA DE LA TRANSACCIÓN DE LECTURA/ESCRITURA) - CORRECCIÓN CLAVE
            await db.collection("transactions").add({
                ...transactionData,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            alert(`¡Préstamo de $${amount.toLocaleString('es-ES')} aprobado! Tu nueva deuda es de $${debtAmount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);

        } catch (e) {
            console.error("Fallo de Transacción de Préstamo:", e);
            alert(`Error al solicitar el préstamo: ${e.message || e}`);
        } finally {
            executeButton.disabled = false;
        }
    }
     
    // NUEVA FUNCIÓN: Lógica para Pagar Deuda - CORREGIDA
    async function performDebtPayment(playerId, paymentAmount) {
        if (paymentAmount <= 0) return alert("El monto debe ser positivo.");

        const playerRef = db.collection('players').doc(playerId);
        executeButton.disabled = true;
        let newDebt = 0;
        let actualPaymentApplied = 0;
        let transactionData = {};


        try {
            await db.runTransaction(async (transaction) => {
                const playerDoc = await transaction.get(playerRef);
                const data = playerDoc.data();
                 
                const currentBalance = data.balance || 0;
                const currentDebt = data.deuda || 0;

                if (currentDebt <= 0) {
                    throw "No tienes deudas pendientes.";
                }

                if (currentBalance < paymentAmount) {
                    throw "Saldo insuficiente para cubrir el pago de la deuda.";
                }
                 
                // El pago se aplica hasta cubrir la deuda
                actualPaymentApplied = Math.min(paymentAmount, currentDebt);
                 
                // Actualizar Saldo y Deuda
                const newBalance = currentBalance - actualPaymentApplied;
                newDebt = currentDebt - actualPaymentApplied; 
                 
                transaction.update(playerRef, { balance: newBalance, deuda: newDebt });
                 
                // Preparar los datos de la transacción
                transactionData = {
                    sender: playerId,
                    recipient: 'bank',
                    amount: actualPaymentApplied,
                    type: 'DEBT_PAYMENT',
                    description: `Pago de deuda por $${actualPaymentApplied.toFixed(2)}. Deuda restante: $${newDebt.toFixed(2)}`,
                };
            });
            
            // REGISTRAR TRANSACCIÓN (FUERA DE LA TRANSACCIÓN DE LECTURA/ESCRITURA) - CORRECCIÓN CLAVE
            await db.collection("transactions").add({
                ...transactionData,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            alert(`Pago de deuda por $${actualPaymentApplied.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} completado. Deuda restante: $${newDebt.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
             
        } catch (e) {
            console.error("Fallo de Pago de Deuda:", e);
            if (e === "Saldo insuficiente para cubrir el pago de la deuda." || e === "No tienes deudas pendientes.") {
                alert(e);
            } else {
                alert(`Error al pagar la deuda: ${e.message || e}`);
            }
        } finally {
            executeButton.disabled = false;
        }
    }


    async function resetGame() {
        if (!confirm("ADVERTENCIA: ¿Estás seguro de que quieres REINICIAR el juego? Se borrarán todas las transacciones, los saldos volverán a $1500, y se resetearán todos los PINs y DEUDAS.")) {
            return;
        }
         
        try {
            const playersSnapshot = await db.collection('players').get();
            const batch = db.batch();
             
            // 1. Resetear saldos, PINs y DEUDA
            playersSnapshot.forEach(doc => {
                const playerRef = db.collection('players').doc(doc.id);
                if (doc.id !== 'bank') {
                    // **RESET DE SALDO, PIN y DEUDA**
                    batch.update(playerRef, { balance: INITIAL_BALANCE, pin: '00', deuda: 0 }); 
                } else {
                    batch.update(playerRef, { balance: 0 }); // El banco no necesita PIN ni deuda
                }
            });

            // 2. Eliminar todas las transacciones
            const transactionsSnapshot = await db.collection('transactions').get();
            transactionsSnapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            alert("¡Juego Reiniciado con éxito! Saldos a $1500, Deudas a $0. El PIN se generará en el próximo inicio de sesión.");
             
            CURRENT_PLAYER_ID = null;
            document.getElementById('main-app').style.display = 'none';
            document.getElementById('login-screen').style.display = 'block';

        } catch (error) {
            console.error("Error al reiniciar el juego:", error);
            alert("Hubo un error al intentar reiniciar el juego. Revisa la consola.");
        }
    }


    // =========================================================
    // 5. LISTENERS EN TIEMPO REAL (Lógica de Actualización de UI)
    // =========================================================

    function startAppListeners() {
        // Escucha en tiempo real los cambios en la colección de jugadores (Saldo y DEUDA)
        db.collection("players").onSnapshot((snapshot) => {
            allPlayersCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            let currentPlayerBalance = 0;
            let currentPlayerName = '';
            let currentPlayerDebt = 0;
             
            const currentPlayer = allPlayersCache.find(p => p.id === CURRENT_PLAYER_ID);
            if (currentPlayer) {
                currentPlayerBalance = currentPlayer.balance;
                currentPlayerName = currentPlayer.name;
                // Mostrar la deuda
                currentPlayerDebt = currentPlayer.deuda || 0; 
            }

            // Mostrar datos en la cabecera
            document.getElementById('current-player-name').textContent = 'Jugador: ' + currentPlayerName;
            document.getElementById('current-balance').textContent = `$${currentPlayerBalance.toLocaleString('es-ES')}`;
            // Actualizar la DEUDA
            document.getElementById('current-debt').textContent = `$${currentPlayerDebt.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`; 
        });

        // Escucha en tiempo real el historial de transacciones (TRANSACCIONES GLOBALES)
        db.collection("transactions").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
            const list = document.getElementById('transactions-list');
            list.innerHTML = ''; 
             
            // Creación del mapa ID -> Nombre
            const playerNames = allPlayersCache.reduce((acc, p) => {
                acc[p.id] = p.name;
                return acc;
            }, {});

            snapshot.forEach((doc) => {
                const data = doc.data();
                const item = document.createElement('div');
                item.classList.add('transaction-item');

                let amountText = '';
                let amountClass = '';
                 
                // Conversión de ID a Nombre usando el mapa
                const senderName = playerNames[data.sender] || (data.sender === 'bank' ? 'BANCO' : data.sender);
                const recipientName = playerNames[data.recipient] || (data.recipient === 'bank' ? 'BANCO' : data.recipient);
                 
                let description = `${senderName} pagó a ${recipientName}`;
                 
                // Usar la descripción del préstamo/pago de deuda si existe
                if (data.description) {
                    description = data.description;
                } else {
                    description = `${senderName} pagó a ${recipientName}`;
                }


                let isCurrentPlayerInvolved = false;

                // Lógica para el énfasis (color del monto y negrita de toda la fila)
                if (data.sender === CURRENT_PLAYER_ID) {
                    // El jugador actual PAGÓ (Negativo - Rojo)
                    amountText = `-$${data.amount.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
                    amountClass = 'negative';
                    isCurrentPlayerInvolved = true;
                } else if (data.recipient === CURRENT_PLAYER_ID) {
                    // El jugador actual RECIBIÓ (Positivo - Verde)
                    amountText = `+$${data.amount.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
                    amountClass = 'positive';
                    isCurrentPlayerInvolved = true;
                } else {
                    // Transacción entre terceros (Normal)
                    amountText = `$${data.amount.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
                    amountClass = ''; 
                }
                 
                if (isCurrentPlayerInvolved) {
                    item.classList.add('highlight-transaction'); 
                }
                 
                const time = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit'}) : '...';

                item.innerHTML = `
                    <div>${description}</div>
                    <div class="amount ${amountClass}">${amountText} (${time})</div>
                `;
                list.appendChild(item);
            });
        });
    }

    // Actualizar botones de pago (jugadores excepto el actual)
    function updatePayButtons() {
        const payGrid = document.querySelector('.pay-buttons-grid');
        payGrid.innerHTML = ''; 

        const targets = allPlayersCache.filter(p => 
            p.id !== CURRENT_PLAYER_ID && p.id !== 'bank' 
        );
         
        targets.forEach(p => {
            const button = document.createElement('button');
            button.classList.add('player-button', 'pay-select-button');
            button.setAttribute('data-player-id', p.id);
            button.setAttribute('data-player-name', p.name);
            button.textContent = p.name;
            payGrid.appendChild(button);
        });

        const bankButton = document.createElement('button');
        bankButton.classList.add('player-button', 'pay-select-button');
        bankButton.setAttribute('data-player-id', 'bank');
        bankButton.setAttribute('data-player-name', 'BANCO');
        bankButton.textContent = 'BANCO';
        payGrid.appendChild(bankButton);
         
        document.querySelectorAll('.pay-select-button').forEach(button => {
            button.addEventListener('click', paySelectHandler);
        });
    }
     
    function resetDynamicArea() {
        dynamicActionArea.style.display = 'none';
        amountInput.value = '';
        amountInput.max = ''; // Resetear maximo
        statusMessage.textContent = '';
        currentAction = { type: null, targetId: null, targetName: null };
    }
    
    // Handler para seleccionar a quién pagar
    function paySelectHandler(e) {
        resetDynamicArea();
        const targetId = e.currentTarget.getAttribute('data-player-id');
        const targetName = e.currentTarget.getAttribute('data-player-name');

        dynamicActionArea.style.display = 'flex';
        actionTitle.textContent = `PAGAR A: ${targetName}`;
        amountInput.placeholder = "Monto a pagar";
        currentAction = { type: 'TRANSFER', targetId: targetId, targetName: targetName };
    }

    // =========================================================
    // 6. EVENTOS (ASIGNACIÓN)
    // =========================================================

    // A. LOGIN: Selección de Jugador
    document.querySelectorAll('.login-button').forEach(button => {
        button.addEventListener('click', async (e) => {
            const playerId = button.getAttribute('data-player-id');
            const playerName = button.textContent;

            const players = await fetchAllPlayers(); 
            const player = players.find(p => p.id === playerId);
             
            document.querySelector('.login-grid').style.display = 'none';
            selectedPlayerForLogin = { id: playerId, name: playerName };
            pinEntryArea.style.display = 'flex'; 
            
            pinInput.type = 'password'; // Asegurar que sea password por defecto
            pinInput.value = '';
            pinInput.disabled = false;
            submitPinButton.style.display = 'inline-block';
            
            // 1. GENERAR PIN SI NO EXISTE ('00' o null)
            if (!player || player.pin === '00' || !player.pin) {
                 
                const newPin = generateTwoDigitPin();
                // Actualizamos el PIN en Firebase
                await db.collection('players').doc(playerId).update({ pin: newPin });
                 
                pinTitle.textContent = `¡TU NUEVO PIN es ${newPin}! Memorízalo.`;
                pinStatusMessage.innerHTML = `<span style="color: ${getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim()}; font-size: 1.1em;">Este es tu PIN de acceso: <b>${newPin}</b></span>`;
                 
                pinInput.type = 'text'; 
                pinInput.value = newPin; 
                pinInput.disabled = true;
                submitPinButton.style.display = 'none'; 
                 
                // Forzar re-ingreso después de 3 segundos
                setTimeout(() => {
                    pinTitle.textContent = `Ingresar PIN para ${playerName}`;
                    pinStatusMessage.textContent = `Ingresa el PIN de 2 dígitos.`; 
                    pinInput.type = 'password';
                    pinInput.value = '';
                    pinInput.disabled = false;
                    submitPinButton.style.display = 'inline-block';
                    pinInput.focus();
                }, 3000); 

            } else {
                // PIN existe, pedir al usuario que lo ingrese
                pinTitle.textContent = `Ingresar PIN para ${playerName}`;
                pinStatusMessage.textContent = `Ingresa el PIN de 2 dígitos.`;
                pinInput.focus();
            }
        });
    });

    // B. LOGIN: Verificación de PIN (Manejador del botón "Acceder")
    submitPinButton.addEventListener('click', async () => {
        const enteredPin = pinInput.value;
        const player = allPlayersCache.find(p => p.id === selectedPlayerForLogin.id);

        if (!player) {
            pinStatusMessage.textContent = 'Error: Jugador no encontrado.';
            return;
        }

        if (enteredPin === player.pin) {
            // Éxito en el Login
            CURRENT_PLAYER_ID = player.id;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('main-app').style.display = 'block';
            resetDynamicArea();
            updatePayButtons(); // Cargar botones de pago
            startAppListeners(); // Iniciar la escucha de DB

        } else {
            // Fallo en el Login
            pinStatusMessage.textContent = 'PIN incorrecto. Intenta de nuevo.';
            pinInput.value = '';
            pinInput.focus();
        }
    });
    
    // C. LOGOUT / VOLVER AL INICIO
    logoutButton.addEventListener('click', () => {
        CURRENT_PLAYER_ID = null;
        document.getElementById('main-app').style.display = 'none';
        document.getElementById('login-screen').style.display = 'block';
        document.querySelector('.login-grid').style.display = 'grid'; // Mostrar botones de jugador
        pinEntryArea.style.display = 'none'; // Ocultar PIN
    });

    // D. RESET GAME
    resetButton.addEventListener('click', resetGame);
    
    // E. VOLVER a selección de jugador (desde pantalla PIN)
    backButton.addEventListener('click', () => {
        document.querySelector('.login-grid').style.display = 'grid'; // Mostrar botones de jugador
        pinEntryArea.style.display = 'none'; // Ocultar PIN
        pinStatusMessage.textContent = '';
        pinInput.value = '';
    });
    
    // F. MANEJADORES DE ACCIONES PRINCIPALES
    
    // F.1. RECIBIR SALARIO
    salaryButton.addEventListener('click', async () => {
        if (!CURRENT_PLAYER_ID) return;
        resetDynamicArea();
        
        // El banco paga al jugador
        await performTransaction('bank', CURRENT_PLAYER_ID, SALARY_AMOUNT, 'SALARY', `Salario de $${SALARY_AMOUNT} recibido`);
    });
    
    // F.2. RECIBIR BANCO (Monto dinámico)
    bankReceiveButton.addEventListener('click', () => {
        resetDynamicArea();
        dynamicActionArea.style.display = 'flex';
        actionTitle.textContent = 'RECIBIR DINERO DEL BANCO';
        amountInput.placeholder = "Monto a recibir";
        currentAction = { type: 'RECEIVE_BANK', targetId: 'bank', targetName: 'BANCO' }; // targetId 'bank' solo para referencia, el sender es 'bank'
    });
    
    // F.3. PEDIR PRÉSTAMO
    requestLoanButton.addEventListener('click', () => {
        resetDynamicArea();
        dynamicActionArea.style.display = 'flex';
        actionTitle.textContent = 'SOLICITAR PRÉSTAMO al BANCO';
        statusMessage.textContent = 'Se añadirá 10% de interés a la deuda.';
        amountInput.placeholder = "Monto del préstamo";
        currentAction = { type: 'LOAN_REQUEST', targetId: 'bank', targetName: 'BANCO' };
    });

    // F.4. PAGAR DEUDA
    payLoanButton.addEventListener('click', () => {
        resetDynamicArea();
        const currentPlayer = allPlayersCache.find(p => p.id === CURRENT_PLAYER_ID);
        const currentDebt = currentPlayer.deuda || 0;
        
        if (currentDebt > 0) {
            dynamicActionArea.style.display = 'flex';
            actionTitle.textContent = `PAGAR DEUDA (Total: $${currentDebt.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
            statusMessage.textContent = 'El pago se aplicará a tu deuda pendiente.';
            amountInput.placeholder = `Monto a pagar (Máx: $${currentDebt.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
            amountInput.max = currentDebt;
            currentAction = { type: 'DEBT_PAYMENT', targetId: 'bank', targetName: 'BANCO' };
        } else {
             alert('No tienes deudas pendientes para pagar.');
        }
    });

    // G. EJECUTAR ACCIÓN DINÁMICA (Botón 'Enviar' en la sección de Monto)
    executeButton.addEventListener('click', async () => {
        const amount = parseInt(amountInput.value);
        if (isNaN(amount) || amount <= 0) {
            statusMessage.textContent = "Ingresa un monto válido mayor a 0.";
            return;
        }

        const senderId = CURRENT_PLAYER_ID;
        let recipientId = currentAction.targetId;
        
        statusMessage.textContent = ''; // Limpiar mensaje

        switch (currentAction.type) {
            case 'TRANSFER':
                // Pago a otro jugador o al banco
                await performTransaction(senderId, recipientId, amount, 'TRANSFER', `${senderId} pagó a ${recipientId}`);
                break;
            case 'RECEIVE_BANK':
                // Recibir dinero del banco (El sender es 'bank')
                await performTransaction('bank', senderId, amount, 'RECEIVE_BANK', `Recibido del Banco`);
                break;
            case 'LOAN_REQUEST':
                // Pedir préstamo
                await performLoanTransaction(senderId, amount);
                break;
            case 'DEBT_PAYMENT':
                // Pagar deuda
                await performDebtPayment(senderId, amount);
                break;
            default:
                statusMessage.textContent = "Acción no válida.";
                return;
        }

        // Si la transacción fue exitosa, esconder la zona dinámica
        if (!executeButton.disabled) { // Si el botón no está deshabilitado, la transacción terminó
             resetDynamicArea();
        }
    });


    // H. FUNCIÓN DE INICIO
    fetchAllPlayers(); // Cargar los jugadores al iniciar

}); // Fin de DOMContentLoaded
