const express = require('express');
const session = require('express-session');
const connection = require('./db');
const app = express();

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');

app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
app.set('view engine', 'ejs');

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));

// Página de inicio (Formulario de Login)
app.get('/', (req, res) => {
    res.render('login', { message: '' });
});

// Autenticación del Usuario
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    connection.query('SELECT usuario,clave as password,nombre FROM siausuarios WHERE usuario = ?', [username], (err, results) => {
        console.log(results,' clave : ',results[0].password);
        const claveusuario = desencriptarclave(results[0].password);
        console.log('clave desencriptada :', claveusuario);

        if (err) throw err;
        if (results.length > 0) {
            console.log('Usuario Ingreso : ',username);
            //bcrypt.compare(password, results[0].password, (err, match) => {
                if (password === claveusuario) {
                    req.session.user = results[0].usuario;
                    res.redirect('/dashboard');
                } else {
                    res.render('login', { message: 'Contraseña incorrecta' });
                }
            //});
        } else {
            res.render('login', { message: 'Usuario no encontrado' });
        }
    });
});

// Página protegida
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    res.render('dashboard', { user: req.session.user });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});


// Ruta para mostrar el formulario de ingreso de empleados
app.get('/empleados', (req, res) => {
    const query = "SELECT identificacion, nombre, departamento, cargo, ciudad FROM empleados";

    connection.query(query, (err, results) => {
        if (err) {
            console.error("Error al obtener empleados:", err);
            res.status(500).send("Error al obtener empleados");
        } else {
            res.render('empleados', { empleados: results }); // Enviamos empleados a la vista
        }
    });
});


app.get('/tallas', (req, res) => {
    if (!req.session.user) return res.redirect('/');

    // Consultar empleados y prendas
    connection.query('SELECT id, nombre FROM empleados', (err, empleados) => {
        if (err) throw err;

        connection.query('SELECT id, nombre FROM prendas', (err, prendas) => {
            if (err) throw err;

            // Consultar las tallas registradas con los datos de empleados y prendas
            const query = `
                SELECT t.id, e.nombre AS empleado, p.nombre AS prenda, t.talla, t.color, t.observaciones 
                FROM tallas t 
                JOIN empleados e ON t.empleado_id = e.id 
                JOIN prendas p ON t.prenda_id = p.id 
                ORDER BY t.id DESC;
            `;

            connection.query(query, (err, tallas) => {
                if (err) throw err;

                res.render('tallas', { 
                    user: req.session.user, 
                    empleados, 
                    prendas, 
                    tallas 
                });
            });
        });
    });
});

app.post('/tallas', (req, res) => {
    const { empleado_id, prenda_id, talla, color, observaciones } = req.body;
    connection.query(
        'INSERT INTO tallas (empleado_id, prenda_id, talla, color, observaciones) VALUES (?, ?, ?, ?, ?)',
        [empleado_id, prenda_id, talla, color, observaciones],
        (err, result) => {
            if (err) throw err;
            res.redirect('/tallas');
        }
    );
});

app.post('/empleados', (req, res) => {
    const { identificacion, nombre, departamento, cargo, ciudad } = req.body;
    connection.query(
        'INSERT INTO empleados (identificacion, nombre, departamento, cargo, ciudad) VALUES (?, ?, ?, ?, ?)', 
        [identificacion, nombre, departamento, cargo, ciudad], 
        (err, result) => {
            if (err) throw err;
            res.redirect('/empleados');
        }
    );
});

app.get('/reporte-excel', (req, res) => {
    const query = `
        SELECT t.id, e.nombre AS empleado, p.nombre AS prenda, t.talla, t.color, t.observaciones 
        FROM tallas t 
        JOIN empleados e ON t.empleado_id = e.id 
        JOIN prendas p ON t.prenda_id = p.id 
        ORDER BY t.id DESC;
    `;

    connection.query(query, async (err, tallas) => {
        if (err) throw err;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Reporte de Tallas');

        // Agregar encabezados
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Empleado', key: 'empleado', width: 25 },
            { header: 'Prenda', key: 'prenda', width: 25 },
            { header: 'Talla', key: 'talla', width: 10 },
            { header: 'Color', key: 'color', width: 15 },
            { header: 'Observaciones', key: 'observaciones', width: 30 }
        ];

        // Agregar datos
        tallas.forEach(talla => worksheet.addRow(talla));

        // Generar archivo Excel
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=reporte_tallas.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    });
});

app.get('/reporte-pdf', (req, res) => {
    const query = `
        SELECT t.id, e.nombre AS empleado, p.nombre AS prenda, t.talla, t.color, t.observaciones 
        FROM tallas t 
        JOIN empleados e ON t.empleado_id = e.id 
        JOIN prendas p ON t.prenda_id = p.id 
        ORDER BY t.id DESC;
    `;

    connection.query(query, (err, tallas) => {
        if (err) throw err;

        const doc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=reporte_tallas.pdf');

        doc.pipe(res);

        doc.fontSize(16).text('Reporte de Tallas', { align: 'center' });
        doc.moveDown();

        tallas.forEach(talla => {
            doc.fontSize(12).text(`ID: ${talla.id}`);
            doc.text(`Empleado: ${talla.empleado}`);
            doc.text(`Prenda: ${talla.prenda}`);
            doc.text(`Talla: ${talla.talla}`);
            doc.text(`Color: ${talla.color}`);
            doc.text(`Observaciones: ${talla.observaciones}`);
            doc.moveDown();
        });

        doc.end();
    });
});

app.get('/reporte-empleados-excel', (req, res) => {
    const query = "SELECT identificacion, nombre, departamento, cargo, ciudad FROM empleados";

    connection.query(query, async (err, empleados) => {
        if (err) throw err;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Empleados');

        // Agregar encabezados
        worksheet.columns = [
            { header: 'Identificación', key: 'identificacion', width: 15 },
            { header: 'Nombre', key: 'nombre', width: 25 },
            { header: 'Departamento', key: 'departamento', width: 20 },
            { header: 'Cargo', key: 'cargo', width: 20 },
            { header: 'Ciudad', key: 'ciudad', width: 15 }
        ];

        // Agregar datos
        empleados.forEach(emp => worksheet.addRow(emp));

        // Generar archivo Excel
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=empleados.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    });
});

app.get('/reporte-empleados-pdf', (req, res) => {
    const query = "SELECT identificacion, nombre, departamento, cargo, ciudad FROM empleados";

    connection.query(query, (err, empleados) => {
        if (err) throw err;

        const doc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=empleados.pdf');

        doc.pipe(res);

        doc.fontSize(16).text('Reporte de Empleados', { align: 'center' });
        doc.moveDown();

        empleados.forEach(emp => {
            doc.fontSize(12).text(`Identificación: ${emp.identificacion}`);
            doc.text(`Nombre: ${emp.nombre}`);
            doc.text(`Departamento: ${emp.departamento}`);
            doc.text(`Cargo: ${emp.cargo}`);
            doc.text(`Ciudad: ${emp.ciudad}`);
            doc.moveDown();
        });

        doc.end();
    });
});


app.listen(3000, () => {
    console.log('Servidor corriendo en http://localhost:3000');
});

function desencriptarclave(claseusuario) {
    const caracterEncriptado = [];
    const caracter = [];
    const valores = [];
    valores.push([3]);
    valores.push([5]);
    valores.push([-7]);
    valores.push([6]);
    valores.push([9]);
    valores.push([-5]);
    valores.push([1]);
    valores.push([4]);
    valores.push([-8]);
    valores.push([9]);
    valores.push([2]);
    valores.push([-1]);
    valores.push([-3]);
    valores.push([7]);
    valores.push([-6]);
    let txtClave = '';
    for (let i = 0; i < claseusuario.length; i++) {
        const caracterclave=claseusuario[i];
        caracterEncriptado.push(caracterclave);
        const caracter=caracterclave.charCodeAt() - valores[i];
        const txtcaracter=String.fromCharCode(caracter);
        console.log('Caracter Ascii : ',txtcaracter);
        txtClave+= txtcaracter;
        console.log('El valor de i es:', i,' Caracter :',caracterclave , ' Codigo Aschii : ',caracter,' ascii : ',txtcaracter,' Dato Key',valores[i]);
    }
    console.log(' Clave BD : ',txtClave);    
    return txtClave;
}